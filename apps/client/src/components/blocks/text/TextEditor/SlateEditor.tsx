import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
} from "react";
import { Descendant, Editor, Element as SlateElement, Transforms, createEditor } from "slate";
import { withHistory } from "slate-history";
import {
  Editable,
  RenderElementProps,
  RenderLeafProps,
  Slate,
  useSlate,
  withReact,
} from "slate-react";
import {
  AlignCenter,
  AlignJustify,
  AlignLeft,
  AlignRight,
  Bold,
  Check,
  Italic,
  Underline,
  type LucideIcon,
} from "lucide-react";
import { Menu, MenuContent, MenuItem, MenuTrigger, cn } from "@repo/ui";
import {
  CustomEditor,
  CustomElement,
  CustomElementType,
  CustomElementWithAlign,
  CustomTextKey,
} from "./custom-types";
import { htmlToSlate } from "./SlateRenderer";

// The rich text editor for the bio and text blocks (Screen Review 018 I02 to
// I06, 037 I07). Prism toolbar of 44 buttons inside the well, roving focus,
// shortcuts, and an Align menu. Saves HTML after the debounce and on blur.

type AlignType = "left" | "center" | "right" | "justify";
type CustomElementFormat = CustomElementType | AlignType;

interface RichTextEditorProps {
  initialValue?: string;
  onSave?: (value: string) => void;
  /** D11: 800ms after the last change */
  debounceTime?: number;
  /** id of the visible label element (aria-labelledby) */
  labelId?: string;
  /** aria-label for the toolbar, for example "Bio formatting" */
  toolbarLabel?: string;
  placeholder?: string;
  /** Minimum editable height in px (89 for the bio, 144 for text blocks) */
  minHeight?: number;
  /** The editable area grows to this height, then scrolls */
  maxHeight?: number;
  /** Receives the latest HTML on every change (for the live preview) */
  onChange?: (value: string) => void;
  onBlur?: () => void;
  invalid?: boolean;
  describedBy?: string;
}

function slateToHtml(nodes: Descendant[]): string {
  return nodes
    .map(node => {
      if (Editor.isEditor(node)) return "";
      if (!("text" in node)) {
        const element = node as CustomElement;
        let tag = "p";
        let attrs = "";
        switch (element.type) {
          case "block-quote":
            tag = "blockquote";
            break;
          case "heading-one":
            tag = "h1";
            break;
          case "heading-two":
            tag = "h2";
            break;
          case "list-item":
            tag = "li";
            break;
          case "numbered-list":
            tag = "ol";
            break;
        }
        if (isAlignElement(element) && element.align) {
          attrs = ` style="text-align: ${element.align}"`;
        }
        const children = element.children.map(child => slateToHtml([child])).join("");
        return `<${tag}${attrs}>${children}</${tag}>`;
      }
      let text = node.text;
      if (node.bold) text = `<strong>${text}</strong>`;
      if (node.italic) text = `<em>${text}</em>`;
      if (node.underline) text = `<u>${text}</u>`;
      if (node.code) text = `<code>${text}</code>`;
      return text;
    })
    .join("");
}

const MARKS: { format: CustomTextKey; icon: LucideIcon; label: string; key: string }[] = [
  { format: "bold", icon: Bold, label: "Bold", key: "B" },
  { format: "italic", icon: Italic, label: "Italic", key: "I" },
  { format: "underline", icon: Underline, label: "Underline", key: "U" },
];

const ALIGNS: { format: AlignType; icon: LucideIcon; label: string }[] = [
  { format: "left", icon: AlignLeft, label: "Left" },
  { format: "center", icon: AlignCenter, label: "Center" },
  { format: "right", icon: AlignRight, label: "Right" },
  { format: "justify", icon: AlignJustify, label: "Justify" },
];

const isMac = typeof navigator !== "undefined" && /Mac|iPhone|iPad/.test(navigator.platform);
const MOD = isMac ? "Cmd" : "Ctrl";

const TOOL =
  "prism-focus inline-flex h-touch w-touch shrink-0 items-center justify-center rounded-prism-13 text-prism-ink-2 transition-colors duration-prism-hover hover:bg-white/60";
const TOOL_PRESSED = "prism-lens-thumb text-prism-nav-pressed shadow-[0_0_0_1.5px_#5650A2]";

const TextEditor = ({
  initialValue,
  onSave,
  debounceTime = 800,
  labelId,
  toolbarLabel = "Text formatting",
  placeholder = "Write something for your visitors",
  minHeight = 89,
  maxHeight = 233,
  onChange,
  onBlur,
  invalid = false,
  describedBy,
}: RichTextEditorProps) => {
  const renderElement = useCallback((props: RenderElementProps) => <Element {...props} />, []);
  const renderLeaf = useCallback((props: RenderLeafProps) => <Leaf {...props} />, []);
  const editor = useMemo(() => withHistory(withReact(createEditor())), []);
  const [initial] = useState<Descendant[]>(() => htmlToSlate(initialValue ?? ""));
  const lastSaved = useRef(initialValue ?? "");
  const latest = useRef(initialValue ?? "");
  const timer = useRef<ReturnType<typeof setTimeout>>();
  const saveRef = useRef(onSave);
  saveRef.current = onSave;

  const flush = useCallback(() => {
    clearTimeout(timer.current);
    if (latest.current !== lastSaved.current) {
      lastSaved.current = latest.current;
      saveRef.current?.(latest.current);
    }
  }, []);

  // Save anything pending when the editor goes away (collapse, destination change)
  useEffect(() => () => flush(), [flush]);

  const handleChange = (value: Descendant[]) => {
    // Selection changes also fire onChange; only content changes count
    const isContentChange = editor.operations.some(op => op.type !== "set_selection");
    if (!isContentChange) return;
    const html = slateToHtml(value);
    latest.current = html;
    onChange?.(html);
    clearTimeout(timer.current);
    timer.current = setTimeout(flush, debounceTime);
  };

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (!(event.metaKey || event.ctrlKey)) return;
    const mark = MARKS.find(m => m.key.toLowerCase() === event.key.toLowerCase());
    if (mark) {
      event.preventDefault();
      toggleMark(editor, mark.format);
    }
  };

  return (
    <Slate editor={editor} initialValue={initial} onChange={handleChange}>
      <div
        className={cn(
          "prism-well overflow-hidden font-prism focus-within:shadow-[0_0_0_1.5px_#0B5A80,0_0_0_5.5px_rgba(39,170,225,0.32)]",
          invalid && "!shadow-[inset_0_0_0_1.5px_#B3261E]"
        )}
      >
        <FormattingToolbar label={toolbarLabel} />
        <Editable
          role="textbox"
          aria-multiline="true"
          aria-labelledby={labelId}
          aria-invalid={invalid || undefined}
          aria-describedby={describedBy}
          renderElement={renderElement}
          renderLeaf={renderLeaf}
          placeholder={placeholder}
          spellCheck
          onKeyDown={onKeyDown}
          onBlur={() => {
            flush();
            onBlur?.();
          }}
          style={{ minHeight, maxHeight }}
          className="overflow-y-auto p-[13px] text-[16px] leading-[26px] text-prism-ink outline-none [&_[data-slate-placeholder]]:!text-prism-ink-3 [&_[data-slate-placeholder]]:!opacity-100"
        />
      </div>
    </Slate>
  );
};

function FormattingToolbar({ label }: { label: string }) {
  const editor = useSlate();
  const ref = useRef<HTMLDivElement>(null);
  const [focusIndex, setFocusIndex] = useState(0);
  const currentAlign = ALIGNS.find(a => isBlockActive(editor, a.format, "align")) ?? ALIGNS[0];

  // Roving tabindex: arrows move between the four buttons (018 I02)
  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key !== "ArrowRight" && event.key !== "ArrowLeft") return;
    const buttons = Array.from(ref.current?.querySelectorAll<HTMLElement>("[data-tool]") ?? []);
    const next =
      (focusIndex + (event.key === "ArrowRight" ? 1 : -1) + buttons.length) % buttons.length;
    event.preventDefault();
    setFocusIndex(next);
    buttons[next]?.focus();
  };

  return (
    <div
      ref={ref}
      role="toolbar"
      aria-label={label}
      onKeyDown={onKeyDown}
      className="flex gap-[3px] border-b border-prism-line px-[5px] py-[5px]"
    >
      {MARKS.map((mark, index) => {
        const active = isMarkActive(editor, mark.format);
        return (
          <button
            key={mark.format}
            type="button"
            data-tool
            tabIndex={focusIndex === index ? 0 : -1}
            aria-label={mark.label}
            aria-pressed={active}
            title={`${mark.label} (${MOD} ${mark.key})`}
            onMouseDown={event => {
              event.preventDefault();
              toggleMark(editor, mark.format);
            }}
            onKeyDown={event => {
              if (event.key === "Enter" || event.key === " ") {
                event.preventDefault();
                toggleMark(editor, mark.format);
              }
            }}
            className={cn(TOOL, active && TOOL_PRESSED)}
          >
            <mark.icon aria-hidden className="h-[21px] w-[21px]" />
          </button>
        );
      })}
      <Menu>
        <MenuTrigger
          data-tool
          tabIndex={focusIndex === 3 ? 0 : -1}
          aria-label={`Align, ${currentAlign.label}`}
          title="Align"
          onMouseDown={event => event.preventDefault()}
          className={TOOL}
        >
          <currentAlign.icon aria-hidden className="h-[21px] w-[21px]" />
        </MenuTrigger>
        <MenuContent align="start" className="w-[144px]">
          {ALIGNS.map(align => {
            const active = align.format === currentAlign.format;
            return (
              <MenuItem key={align.format} onSelect={() => setAlign(editor, align.format)}>
                <align.icon aria-hidden />
                <span className="flex-1">{align.label}</span>
                {active && <Check aria-hidden className="h-4 w-4" />}
              </MenuItem>
            );
          })}
        </MenuContent>
      </Menu>
    </div>
  );
}

function setAlign(editor: CustomEditor, format: AlignType) {
  if (!editor.selection) {
    Transforms.select(editor, Editor.start(editor, []));
  }
  Transforms.setNodes<SlateElement>(editor, { align: format === "left" ? undefined : format });
}

const toggleMark = (editor: CustomEditor, format: CustomTextKey) => {
  if (isMarkActive(editor, format)) Editor.removeMark(editor, format);
  else Editor.addMark(editor, format, true);
};

const isBlockActive = (
  editor: CustomEditor,
  format: CustomElementFormat,
  blockType: "type" | "align" = "type"
) => {
  const { selection } = editor;
  if (!selection) return false;
  const [match] = Array.from(
    Editor.nodes(editor, {
      at: Editor.unhangRange(editor, selection),
      match: n => {
        if (!Editor.isEditor(n) && SlateElement.isElement(n)) {
          if (blockType === "align" && isAlignElement(n)) return n.align === format;
          return n.type === format;
        }
        return false;
      },
    })
  );
  return !!match;
};

const isMarkActive = (editor: CustomEditor, format: CustomTextKey) => {
  const marks = Editor.marks(editor);
  return marks ? marks[format] === true : false;
};

const Element = ({ attributes, children, element }: RenderElementProps) => {
  const style: React.CSSProperties = {};
  if (isAlignElement(element)) style.textAlign = element.align as AlignType;
  switch (element.type) {
    case "block-quote":
      return (
        <blockquote style={style} {...attributes}>
          {children}
        </blockquote>
      );
    case "heading-one":
      return (
        <h1 style={style} {...attributes}>
          {children}
        </h1>
      );
    case "heading-two":
      return (
        <h2 style={style} {...attributes}>
          {children}
        </h2>
      );
    default:
      return (
        <p style={style} {...attributes}>
          {children}
        </p>
      );
  }
};

const Leaf = ({ attributes, children, leaf }: RenderLeafProps) => {
  if (leaf.bold) children = <strong>{children}</strong>;
  if (leaf.code) children = <code>{children}</code>;
  if (leaf.italic) children = <em>{children}</em>;
  if (leaf.underline) children = <u>{children}</u>;
  return <span {...attributes}>{children}</span>;
};

const isAlignElement = (element: CustomElement): element is CustomElementWithAlign => {
  return "align" in element;
};

export default TextEditor;
