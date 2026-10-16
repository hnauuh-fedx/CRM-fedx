(function () {
  "use strict";

  var script = document.currentScript;
  if (!script) return;
  var formId = script.dataset.formId || "";
  var formUrl = script.dataset.formUrl || "";
  var configuredRedirectValue = script.dataset.redirectUrl || "";
  var mountId = script.dataset.mountId || "admission-crm-form-" + formId;
  var mount = document.getElementById(mountId);
  if (!formId || !formUrl || !mount) return;

  var iframeUrl;
  try {
    iframeUrl = new URL(formUrl, document.baseURI);
  } catch (_error) {
    return;
  }
  if (
    iframeUrl.protocol !== "https:" &&
    !(
      iframeUrl.protocol === "http:" &&
      ["localhost", "127.0.0.1", "[::1]"].includes(iframeUrl.hostname)
    )
  )
    return;
  var configuredRedirect = "";
  if (configuredRedirectValue && configuredRedirectValue.length <= 2048) {
    try {
      var redirectUrl = new URL(configuredRedirectValue);
      var localRedirect = ["localhost", "127.0.0.1", "[::1]"].includes(
        redirectUrl.hostname,
      );
      if (
        redirectUrl.toString() === configuredRedirectValue &&
        (redirectUrl.protocol === "https:" ||
          (redirectUrl.protocol === "http:" && localRedirect))
      ) {
        configuredRedirect = redirectUrl.toString();
      }
    } catch (_error) {
      // Ignore an invalid redirect configured by the embedding page.
    }
  }
  iframeUrl.searchParams.set("embed", "1");
  iframeUrl.searchParams.set("parent_origin", window.location.origin);

  var iframe = document.createElement("iframe");
  iframe.src = iframeUrl.toString();
  iframe.title = script.dataset.title || "Form & Survey";
  iframe.loading = "lazy";
  iframe.referrerPolicy = "strict-origin-when-cross-origin";
  iframe.style.cssText =
    "width:100%;min-height:720px;border:0;border-radius:12px;overflow:hidden;";
  mount.appendChild(iframe);

  var protocol = "admission-crm.form-embed";
  var version = 1;
  var allowedTracking = [
    "utm_source",
    "utm_medium",
    "utm_campaign",
    "utm_content",
    "utm_term",
  ];
  function exactKeys(value, keys) {
    var actual = Object.keys(value);
    var allowedKeys = new Set(keys);
    return (
      actual.length === keys.length &&
      actual.every(function (key) {
        return allowedKeys.has(key);
      })
    );
  }
  function tracking() {
    var params = new URLSearchParams(window.location.search);
    var result = {};
    allowedTracking.forEach(function (key) {
      var value = (params.get(key) || "").trim();
      if (value && value.length <= 200) result[key] = value;
    });
    var sourceUrl = new URL(window.location.href);
    sourceUrl.hash = "";
    Array.from(sourceUrl.searchParams.keys()).forEach(function (key) {
      if (allowedTracking.indexOf(key) === -1)
        sourceUrl.searchParams.delete(key);
    });
    if (sourceUrl.toString().length <= 1000)
      result.source_url = sourceUrl.toString();
    if (document.referrer) {
      try {
        var referrerUrl = new URL(document.referrer);
        referrerUrl.search = "";
        referrerUrl.hash = "";
        if (referrerUrl.toString().length <= 1000)
          result.source_referrer = referrerUrl.toString();
      } catch (_error) {
        // Ignore malformed browser referrers.
      }
    }
    return result;
  }
  function sendTracking() {
    if (!iframe.contentWindow) return;
    iframe.contentWindow.postMessage(
      {
        protocol: protocol,
        version: version,
        type: "tracking",
        formId: formId,
        tracking: tracking(),
      },
      iframeUrl.origin,
    );
  }
  iframe.addEventListener("load", sendTracking);
  window.addEventListener("message", function (event) {
    if (
      event.origin !== iframeUrl.origin ||
      event.source !== iframe.contentWindow
    )
      return;
    var data = event.data;
    if (
      !data ||
      data.protocol !== protocol ||
      data.version !== version ||
      data.formId !== formId
    )
      return;
    var baseKeys = ["protocol", "version", "type", "formId"];
    if (data.type === "ready" && exactKeys(data, baseKeys)) {
      sendTracking();
      return;
    }
    if (
      data.type === "resize" &&
      exactKeys(data, baseKeys.concat("height")) &&
      Number.isInteger(data.height) &&
      data.height >= 240 &&
      data.height <= 4000
    ) {
      iframe.style.minHeight = "240px";
      iframe.style.height = data.height + "px";
      return;
    }
    if (
      data.type === "redirect" &&
      exactKeys(data, baseKeys.concat("url")) &&
      configuredRedirect &&
      data.url === configuredRedirect
    ) {
      window.location.assign(configuredRedirect);
    }
  });
})();
