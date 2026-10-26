"use client"

import * as React from "react"
import { CheckIcon, ChevronDownIcon, ChevronUpIcon, SearchIcon } from "lucide-react"
import { Select as SelectPrimitive } from "radix-ui"

import { normalizeVietnameseText } from "@admission-crm/shared/lead-field-groups"

import { cn } from "@/lib/utils"

function Select({
  onValueChange,
  ...props
}: React.ComponentProps<typeof SelectPrimitive.Root>) {
  return (
    <SelectPrimitive.Root
      data-slot="select"
      {...props}
      // Inside a <form>, Radix mirrors the value into a hidden native <select>; when the value and
      // its options change together the browser resets it and Radix reports "". No item may use "",
      // so it is never a real choice and is ignored.
      onValueChange={(value) => {
        if (value !== "") onValueChange?.(value)
      }}
    />
  )
}

function SelectGroup({
  ...props
}: React.ComponentProps<typeof SelectPrimitive.Group>) {
  return <SelectPrimitive.Group data-slot="select-group" {...props} />
}

function SelectValue({
  ...props
}: React.ComponentProps<typeof SelectPrimitive.Value>) {
  return <SelectPrimitive.Value data-slot="select-value" {...props} />
}

function SelectTrigger({
  className,
  size = "default",
  children,
  ...props
}: React.ComponentProps<typeof SelectPrimitive.Trigger> & {
  size?: "sm" | "default"
}) {
  return (
    <SelectPrimitive.Trigger
      data-slot="select-trigger"
      data-size={size}
      className={cn(
        "flex w-fit items-center justify-between gap-2 rounded-md border border-input bg-transparent px-3 py-2 text-sm whitespace-nowrap shadow-xs transition-[color,box-shadow] outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-50 aria-invalid:border-destructive aria-invalid:ring-destructive/20 data-[placeholder]:text-muted-foreground data-[size=default]:h-9 data-[size=sm]:h-8 *:data-[slot=select-value]:line-clamp-1 *:data-[slot=select-value]:flex *:data-[slot=select-value]:items-center *:data-[slot=select-value]:gap-2 dark:bg-input/30 dark:hover:bg-input/50 dark:aria-invalid:ring-destructive/40 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4 [&_svg:not([class*='text-'])]:text-muted-foreground",
        className
      )}
      {...props}
    >
      {children}
      <SelectPrimitive.Icon asChild>
        <ChevronDownIcon className="size-4 opacity-50" />
      </SelectPrimitive.Icon>
    </SelectPrimitive.Trigger>
  )
}

/** Lists longer than about 8 rows, or that scroll, get a search box automatically. */
const SEARCH_THRESHOLD = 8

const SelectSearchContext = React.createContext("")

/** Plain text of an item, used for searching; `textValue` wins when provided. */
function nodeText(node: React.ReactNode): string {
  if (node === null || node === undefined || typeof node === "boolean") return ""
  if (typeof node === "string" || typeof node === "number") return String(node)
  if (Array.isArray(node)) return node.map(nodeText).join(" ")
  if (React.isValidElement<{ children?: React.ReactNode }>(node)) return nodeText(node.props.children)
  return ""
}

function itemText(props: { textValue?: string; children?: React.ReactNode }) {
  return props.textValue ?? nodeText(props.children)
}

function matchesSearch(text: string, query: string) {
  return !query || normalizeVietnameseText(text).includes(query)
}

function SelectContent({
  className,
  children,
  // Popper keeps the list below its trigger (flipping above when needed) instead of covering the field and its label.
  position = "popper",
  align = "start",
  searchable,
  searchPlaceholder = "Tìm giá trị",
  onCloseAutoFocus,
  ...props
}: React.ComponentProps<typeof SelectPrimitive.Content> & {
  /** Force the search box on or off; by default it appears for lists longer than the dropdown. */
  searchable?: boolean
  searchPlaceholder?: string
}) {
  const [search, setSearch] = React.useState("")
  const [longList, setLongList] = React.useState(false)
  const [matchedCount, setMatchedCount] = React.useState(0)
  const viewportRef = React.useRef<HTMLDivElement | null>(null)
  const observerRef = React.useRef<ResizeObserver | null>(null)
  const query = normalizeVietnameseText(search)
  const queryRef = React.useRef(query)
  queryRef.current = query
  const showSearch = searchable ?? longList
  // Measured from the rendered items, so lists built from wrapper components are counted too.
  const measure = React.useCallback(() => {
    const viewport = viewportRef.current
    if (!viewport) return
    const items = viewport.querySelectorAll('[data-slot="select-item"]').length
    const visible = viewport.querySelectorAll('[data-slot="select-item"]:not([data-search-hidden])').length
    const scrolls = viewport.scrollHeight > viewport.clientHeight + 1
    setMatchedCount(visible)
    // While searching the list shrinks, so the box stays until the query is cleared.
    setLongList((current) => (queryRef.current ? current : items > SEARCH_THRESHOLD || scrolls))
  }, [])
  // Open state lives inside Radix, so this component may not re-render when the list opens:
  // measure when the list element mounts, and again whenever Radix resizes it.
  const attachViewport = React.useCallback((node: HTMLDivElement | null) => {
    observerRef.current?.disconnect()
    observerRef.current = null
    viewportRef.current = node
    if (!node) return
    measure()
    if (typeof ResizeObserver !== "undefined") {
      observerRef.current = new ResizeObserver(measure)
      observerRef.current.observe(node)
    }
  }, [measure])
  React.useLayoutEffect(() => {
    measure()
  })
  // Radix focuses the selected item on open; move focus to the search box once it is mounted.
  const focusSearch = React.useCallback((input: HTMLInputElement | null) => {
    if (input) requestAnimationFrame(() => input.focus({ preventScroll: true }))
  }, [])
  return (
    <SelectPrimitive.Portal>
      <SelectPrimitive.Content
        data-slot="select-content"
        className={cn(
          "relative z-50 flex max-h-[min(20rem,var(--radix-select-content-available-height))] min-w-[8rem] origin-(--radix-select-content-transform-origin) flex-col overflow-hidden rounded-md border bg-popover text-popover-foreground shadow-md data-[side=bottom]:slide-in-from-top-2 data-[side=left]:slide-in-from-right-2 data-[side=right]:slide-in-from-left-2 data-[side=top]:slide-in-from-bottom-2 data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=closed]:zoom-out-95 data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:zoom-in-95",
          position === "popper" &&
            "data-[side=bottom]:translate-y-1 data-[side=left]:-translate-x-1 data-[side=right]:translate-x-1 data-[side=top]:-translate-y-1",
          className
        )}
        position={position}
        align={align}
        onCloseAutoFocus={(event) => {
          setSearch("")
          onCloseAutoFocus?.(event)
        }}
        {...props}
      >
        {showSearch ? (
          <div className="shrink-0 border-b p-2">
            <div className="relative">
              <SearchIcon className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
              <input
                ref={focusSearch}
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                // Typed characters must not reach Radix typeahead; arrows and Escape still drive the list.
                onKeyDown={(event) => {
                  if (!["ArrowDown", "ArrowUp", "Escape", "Tab"].includes(event.key)) event.stopPropagation()
                }}
                placeholder={searchPlaceholder}
                aria-label={searchPlaceholder}
                className="h-9 w-full min-w-0 rounded-md border border-input bg-transparent pr-3 pl-9 text-sm shadow-xs outline-none placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 dark:bg-input/30"
              />
            </div>
          </div>
        ) : null}
        <SelectPrimitive.Viewport
          ref={attachViewport}
          className={cn(
            // A regular scrollbar (Radix hides it by default) so long lists scroll like the field picker.
            "min-h-0 flex-1 overflow-y-auto p-1 [scrollbar-width:thin]! [&::-webkit-scrollbar]:block!",
            position === "popper" &&
              "w-full min-w-[var(--radix-select-trigger-width)] scroll-my-1"
          )}
        >
          <SelectSearchContext.Provider value={query}>{children}</SelectSearchContext.Provider>
          {showSearch && query && matchedCount === 0 ? (
            <p className="px-2 py-6 text-center text-sm text-muted-foreground">Không tìm thấy giá trị phù hợp.</p>
          ) : null}
        </SelectPrimitive.Viewport>
      </SelectPrimitive.Content>
    </SelectPrimitive.Portal>
  )
}

function SelectLabel({
  className,
  ...props
}: React.ComponentProps<typeof SelectPrimitive.Label>) {
  // Group headings are hidden while searching so matches read as one list.
  const query = React.useContext(SelectSearchContext)
  return (
    <SelectPrimitive.Label
      data-slot="select-label"
      className={cn("px-2 py-1.5 text-xs text-muted-foreground", query && "hidden", className)}
      {...props}
    />
  )
}

function SelectItem({
  className,
  children,
  disabled,
  ...props
}: React.ComponentProps<typeof SelectPrimitive.Item>) {
  const query = React.useContext(SelectSearchContext)
  // Non-matching items stay mounted (Radix reads the selected item text from them) but are hidden and skipped.
  const hidden = !matchesSearch(itemText({ textValue: props.textValue, children }), query)
  return (
    <SelectPrimitive.Item
      data-slot="select-item"
      disabled={disabled || hidden}
      data-search-hidden={hidden || undefined}
      className={cn(
        "relative flex w-full cursor-default items-center gap-2 rounded-sm py-1.5 pr-8 pl-2 text-sm outline-hidden select-none focus:bg-accent focus:text-accent-foreground data-[disabled]:pointer-events-none data-[disabled]:opacity-50 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4 [&_svg:not([class*='text-'])]:text-muted-foreground *:[span]:last:flex *:[span]:last:items-center *:[span]:last:gap-2",
        hidden && "hidden",
        className
      )}
      {...props}
    >
      <span
        data-slot="select-item-indicator"
        className="absolute right-2 flex size-3.5 items-center justify-center"
      >
        <SelectPrimitive.ItemIndicator>
          <CheckIcon className="size-4" />
        </SelectPrimitive.ItemIndicator>
      </span>
      <SelectPrimitive.ItemText>{children}</SelectPrimitive.ItemText>
    </SelectPrimitive.Item>
  )
}

function SelectSeparator({
  className,
  ...props
}: React.ComponentProps<typeof SelectPrimitive.Separator>) {
  return (
    <SelectPrimitive.Separator
      data-slot="select-separator"
      className={cn("pointer-events-none -mx-1 my-1 h-px bg-border", className)}
      {...props}
    />
  )
}

function SelectScrollUpButton({
  className,
  ...props
}: React.ComponentProps<typeof SelectPrimitive.ScrollUpButton>) {
  return (
    <SelectPrimitive.ScrollUpButton
      data-slot="select-scroll-up-button"
      className={cn(
        "flex cursor-default items-center justify-center py-1",
        className
      )}
      {...props}
    >
      <ChevronUpIcon className="size-4" />
    </SelectPrimitive.ScrollUpButton>
  )
}

function SelectScrollDownButton({
  className,
  ...props
}: React.ComponentProps<typeof SelectPrimitive.ScrollDownButton>) {
  return (
    <SelectPrimitive.ScrollDownButton
      data-slot="select-scroll-down-button"
      className={cn(
        "flex cursor-default items-center justify-center py-1",
        className
      )}
      {...props}
    >
      <ChevronDownIcon className="size-4" />
    </SelectPrimitive.ScrollDownButton>
  )
}

export {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectScrollDownButton,
  SelectScrollUpButton,
  SelectSeparator,
  SelectTrigger,
  SelectValue,
}
