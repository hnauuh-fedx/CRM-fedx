import type { AutomationEdge, AutomationGraphData, AutomationNode, AutomationNodeType } from "./automation.types";

export type AutomationGraphValidationIssueCode =
  | "INVALID_GRAPH"
  | "UNSUPPORTED_TRIGGER"
  | "DUPLICATE_NODE_ID"
  | "DUPLICATE_EDGE_ID"
  | "INVALID_EDGE"
  | "INVALID_PORT"
  | "INVALID_ROOT"
  | "UNREACHABLE_NODE"
  | "CYCLE_DETECTED"
  | "INVALID_NODE_CONFIG"
  | "UNSUPPORTED_FAN_OUT"
  | "UNSUPPORTED_FAN_IN";

export type AutomationGraphValidationIssue = {
  code: AutomationGraphValidationIssueCode;
  message: string;
  nodeId?: string;
  edgeId?: string;
};

export type AutomationGraphValidationResult = {
  valid: boolean;
  issues: AutomationGraphValidationIssue[];
};

const supportedNodeTypes = new Set<AutomationNodeType>([
  "trigger",
  "condition",
  "action_notification",
  "action_assign",
  "action_update_stage",
  "action_activity",
  "delay",
]);

export function validateAutomationGraph(value: unknown): AutomationGraphValidationResult {
  if (!isGraph(value)) {
    return invalid({ code: "INVALID_GRAPH", message: "Cấu trúc graph automation không hợp lệ." });
  }

  const graph = value;
  const issues: AutomationGraphValidationIssue[] = [];
  const nodesById = new Map<string, AutomationNode>();
  const edgeIds = new Set<string>();

  for (const node of graph.nodes) {
    if (nodesById.has(node.id)) {
      issues.push({ code: "DUPLICATE_NODE_ID", nodeId: node.id, message: `Node ${node.id} bị trùng mã.` });
      continue;
    }
    nodesById.set(node.id, node);
    issues.push(...validateNodeConfig(node));
  }

  const validEdges: AutomationEdge[] = [];
  for (const edge of graph.edges) {
    if (edgeIds.has(edge.id)) {
      issues.push({ code: "DUPLICATE_EDGE_ID", edgeId: edge.id, message: `Cạnh ${edge.id} bị trùng mã.` });
      continue;
    }
    edgeIds.add(edge.id);

    const source = nodesById.get(edge.source);
    const target = nodesById.get(edge.target);
    if (!source || !target || edge.source === edge.target) {
      issues.push({
        code: "INVALID_EDGE",
        edgeId: edge.id,
        message: "Cạnh phải nối hai node tồn tại và không được tự nối chính nó.",
      });
      continue;
    }
    if (!isValidSourceHandle(source.type, edge.sourceHandle)) {
      issues.push({
        code: "INVALID_PORT",
        edgeId: edge.id,
        nodeId: source.id,
        message: `Cổng ra của node ${source.id} không hợp lệ.`,
      });
      continue;
    }
    validEdges.push(edge);
  }

  const roots = graph.nodes.filter((node) => node.type === "trigger");
  if (roots.length !== 1) {
    issues.push({ code: "INVALID_ROOT", message: "Rule phải có đúng một node khởi động." });
  }

  const outgoing = groupEdges(validEdges, "source");
  const incoming = groupEdges(validEdges, "target");
  const root = roots[0];
  if (root) {
    if ((incoming.get(root.id)?.length ?? 0) > 0) {
      issues.push({ code: "INVALID_ROOT", nodeId: root.id, message: "Node khởi động không được có cạnh đi vào." });
    }
    if ((outgoing.get(root.id)?.length ?? 0) !== 1) {
      issues.push({
        code: "UNSUPPORTED_FAN_OUT",
        nodeId: root.id,
        message: "Node khởi động phải có đúng một nhánh ra trong phiên bản hiện tại.",
      });
    }
  }

  for (const node of graph.nodes) {
    const outgoingEdges = outgoing.get(node.id) ?? [];
    const incomingEdges = incoming.get(node.id) ?? [];

    if (node.type === "condition") {
      for (const handle of ["default", "false"] as const) {
        if (outgoingEdges.filter((edge) => (edge.sourceHandle ?? "default") === handle).length > 1) {
          issues.push({
            code: "UNSUPPORTED_FAN_OUT",
            nodeId: node.id,
            message: `Mỗi nhánh của node điều kiện ${node.id} chỉ được nối tới một node.`,
          });
        }
      }
    } else if (node.type !== "trigger" && outgoingEdges.length > 1) {
      issues.push({
        code: "UNSUPPORTED_FAN_OUT",
        nodeId: node.id,
        message: `Node ${node.id} chỉ được có tối đa một nhánh ra trong phiên bản hiện tại.`,
      });
    }

    if (node.type !== "trigger" && incomingEdges.length > 1) {
      issues.push({
        code: "UNSUPPORTED_FAN_IN",
        nodeId: node.id,
        message: `Node ${node.id} chưa hỗ trợ hợp nhất nhiều nhánh đi vào.`,
      });
    }
  }

  if (root) {
    const reachable = collectReachable(root.id, outgoing);
    for (const node of graph.nodes) {
      if (!reachable.has(node.id)) {
        issues.push({
          code: "UNREACHABLE_NODE",
          nodeId: node.id,
          message: `Node ${node.id} không được nối với luồng bắt đầu.`,
        });
      }
    }
  }

  if (hasCycle(graph.nodes, validEdges)) {
    issues.push({ code: "CYCLE_DETECTED", message: "Rule chưa hỗ trợ chu trình giữa các node." });
  }

  return { valid: issues.length === 0, issues };
}

function validateNodeConfig(node: AutomationNode): AutomationGraphValidationIssue[] {
  const issues: AutomationGraphValidationIssue[] = [];
  const missing = (message: string) =>
    issues.push({ code: "INVALID_NODE_CONFIG", nodeId: node.id, message });

  if (!node.data.label?.trim()) missing(`Node ${node.id} phải có tên hiển thị.`);

  switch (node.type) {
    case "trigger":
      break;
    case "condition":
      if (!node.data.field || !node.data.operator) missing(`Node điều kiện ${node.id} chưa chọn trường hoặc toán tử.`);
      if (node.data.operator !== "exists" && !hasText(node.data.value)) missing(`Node điều kiện ${node.id} chưa có giá trị so sánh.`);
      break;
    case "action_notification":
      if (!hasText(node.data.title) || !hasText(node.data.content) || !hasText(node.data.targetRole)) {
        missing(`Node thông báo ${node.id} phải có tiêu đề, nội dung và vai trò nhận.`);
      }
      break;
    case "action_assign":
      if (!hasText(node.data.assignToUserId)) missing(`Node phân công ${node.id} chưa chọn nhân viên.`);
      break;
    case "action_update_stage":
      if (!hasText(node.data.stageId)) missing(`Node cập nhật pipeline ${node.id} chưa chọn giai đoạn.`);
      break;
    case "action_activity":
      if (!hasText(node.data.activityType) || !hasText(node.data.activityContent)) {
        missing(`Node hoạt động ${node.id} phải có loại và nội dung.`);
      }
      break;
    case "delay":
      if (!Number.isFinite(Number(node.data.delayMinutes)) || Number(node.data.delayMinutes) <= 0) {
        missing(`Node chờ ${node.id} phải có thời gian lớn hơn 0 phút.`);
      }
      break;
  }
  return issues;
}

function isGraph(value: unknown): value is AutomationGraphData {
  if (!isRecord(value) || !Array.isArray(value.nodes) || !Array.isArray(value.edges)) return false;
  return value.nodes.every(isNode) && value.edges.every(isEdge);
}

function isNode(value: unknown): value is AutomationNode {
  return (
    isRecord(value) &&
    typeof value.id === "string" &&
    value.id.length > 0 &&
    typeof value.type === "string" &&
    supportedNodeTypes.has(value.type as AutomationNodeType) &&
    isRecord(value.data) &&
    isRecord(value.position) &&
    typeof value.position.x === "number" &&
    typeof value.position.y === "number"
  );
}

function isEdge(value: unknown): value is AutomationEdge {
  return (
    isRecord(value) &&
    typeof value.id === "string" &&
    value.id.length > 0 &&
    typeof value.source === "string" &&
    typeof value.target === "string" &&
    (value.sourceHandle === undefined || value.sourceHandle === null || typeof value.sourceHandle === "string")
  );
}

function isRecord(value: unknown): value is Record<string, any> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function hasText(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function isValidSourceHandle(type: AutomationNodeType, handle: string | null | undefined) {
  const normalized = handle ?? "default";
  return type === "condition" ? normalized === "default" || normalized === "false" : normalized === "default";
}

function groupEdges(edges: AutomationEdge[], key: "source" | "target") {
  const result = new Map<string, AutomationEdge[]>();
  for (const edge of edges) {
    const id = edge[key];
    result.set(id, [...(result.get(id) ?? []), edge]);
  }
  return result;
}

function collectReachable(rootId: string, outgoing: Map<string, AutomationEdge[]>) {
  const visited = new Set<string>();
  const pending = [rootId];
  while (pending.length > 0) {
    const nodeId = pending.pop()!;
    if (visited.has(nodeId)) continue;
    visited.add(nodeId);
    for (const edge of outgoing.get(nodeId) ?? []) pending.push(edge.target);
  }
  return visited;
}

function hasCycle(nodes: AutomationNode[], edges: AutomationEdge[]) {
  const indegree = new Map(nodes.map((node) => [node.id, 0]));
  const outgoing = groupEdges(edges, "source");
  for (const edge of edges) indegree.set(edge.target, (indegree.get(edge.target) ?? 0) + 1);

  const queue = nodes.filter((node) => indegree.get(node.id) === 0).map((node) => node.id);
  let visited = 0;
  while (queue.length > 0) {
    const nodeId = queue.shift()!;
    visited += 1;
    for (const edge of outgoing.get(nodeId) ?? []) {
      const nextDegree = (indegree.get(edge.target) ?? 0) - 1;
      indegree.set(edge.target, nextDegree);
      if (nextDegree === 0) queue.push(edge.target);
    }
  }
  return visited !== nodes.length;
}

function invalid(issue: AutomationGraphValidationIssue): AutomationGraphValidationResult {
  return { valid: false, issues: [issue] };
}
