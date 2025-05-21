import { css } from "./SlateComponents";
import React, { useCallback, useMemo } from "react";
import { Descendant, Transforms, createEditor } from "slate";
import { withHistory } from "slate-history";
import { jsx } from "slate-hyperscript";
import {
  Editable,
  RenderElementProps,
  RenderLeafProps,
  Slate,
  useFocused,
  useSelected,
  withReact,
} from "slate-react";

import {
  CustomEditor,
  CustomElement,
  CustomElementType,
  ImageElement as ImageElementType,
  RenderElementPropsFor,
} from "./custom-types";

interface ElementAttributes {
  type: CustomElementType;
  url?: string;
}

const ELEMENT_TAGS: Record<string, (el: HTMLElement) => ElementAttributes> = {
  A: el => ({ type: "link", url: el.getAttribute("href")! }),
  BLOCKQUOTE: () => ({ type: "block-quote" }),
  H1: () => ({ type: "heading-one" }),
  H2: () => ({ type: "heading-two" }),
  H3: () => ({ type: "heading-three" }),
  H4: () => ({ type: "heading-four" }),
  H5: () => ({ type: "heading-five" }),
  H6: () => ({ type: "heading-six" }),
  IMG: el => ({ type: "image", url: el.getAttribute("src")! }),
  P: () => ({ type: "paragraph" }),
};

// COMPAT: `B` is omitted here because Google Docs uses `<b>` in weird ways.
interface TextAttributes {
  code?: boolean;
  strikethrough?: boolean;
  italic?: boolean;
  bold?: boolean;
  underline?: boolean;
}

const TEXT_TAGS: Record<string, () => TextAttributes> = {
  CODE: () => ({ code: true }),
  DEL: () => ({ strikethrough: true }),
  EM: () => ({ italic: true }),
  I: () => ({ italic: true }),
  S: () => ({ strikethrough: true }),
  STRONG: () => ({ bold: true }),
  U: () => ({ underline: true }),
};

export const deserialize = (el: HTMLElement | ChildNode): any => {
  if (el.nodeType === 3) {
    return el.textContent;
  } else if (el.nodeType !== 1) {
    return null;
  } else if (el.nodeName === "BR") {
    return "\n";
  }

  const { nodeName } = el;
  let parent = el;

  if (nodeName === "PRE" && el.childNodes[0] && el.childNodes[0].nodeName === "CODE") {
    parent = el.childNodes[0];
  }
  let children = Array.from(parent.childNodes).map(deserialize).flat();

  if (children.length === 0) {
    children = [{ text: "" }];
  }

  if (el.nodeName === "BODY") {
    return jsx("fragment", {}, children);
  }

  if (ELEMENT_TAGS[nodeName]) {
    const attrs = ELEMENT_TAGS[nodeName](el as HTMLElement);
    return jsx("element", attrs, children);
  }

  if (TEXT_TAGS[nodeName]) {
    const attrs = TEXT_TAGS[nodeName]();
    return children.map(child => jsx("text", attrs, child));
  }

  return children;
};

// Convert HTML string to Slate format
export const htmlToSlate = (html: string): Descendant[] => {
  if (html.length === 0) {
    return [{ type: "paragraph", children: [{ text: "" }] }];
  }

  const parsed = new DOMParser().parseFromString(html, "text/html");
  const fragment = deserialize(parsed.body);
  return fragment;
};

interface SlateRendererProps {
  value?: string; // HTML content as a string
}

const SlateRenderer = ({ value = "" }: SlateRendererProps) => {
  const renderElement = useCallback((props: RenderElementProps) => <Element {...props} />, []);
  const renderLeaf = useCallback((props: RenderLeafProps) => <Leaf {...props} />, []);
  const editor = useMemo(
    () => withHtml(withReact(withHistory(createEditor()))) as CustomEditor,
    []
  );

  // Convert HTML to Slate format
  const initialSlateValue = useMemo(() => {
    return htmlToSlate(value);
  }, [value]);

  return (
    <Slate editor={editor} initialValue={initialSlateValue}>
      <Editable renderElement={renderElement} renderLeaf={renderLeaf} readOnly={true} />
    </Slate>
  );
};

const withHtml = (editor: CustomEditor) => {
  const { insertData, isInline, isVoid } = editor;

  editor.isInline = (element: CustomElement) => {
    return element.type === "link" ? true : isInline(element);
  };

  editor.isVoid = (element: CustomElement) => {
    return element.type === "image" ? true : isVoid(element);
  };

  editor.insertData = data => {
    const html = data.getData("text/html");

    if (html) {
      const parsed = new DOMParser().parseFromString(html, "text/html");
      const fragment = deserialize(parsed.body);
      Transforms.insertFragment(editor, fragment);
      return;
    }

    insertData(data);
  };

  return editor;
};

const Element = (props: RenderElementProps) => {
  const { attributes, children, element } = props;

  switch (element.type) {
    default:
      return <p {...attributes}>{children}</p>;
    case "block-quote":
      return <blockquote {...attributes}>{children}</blockquote>;
    case "heading-one":
      return <h1 {...attributes}>{children}</h1>;
    case "heading-two":
      return <h2 {...attributes}>{children}</h2>;
    case "heading-three":
      return <h3 {...attributes}>{children}</h3>;
    case "heading-four":
      return <h4 {...attributes}>{children}</h4>;
    case "heading-five":
      return <h5 {...attributes}>{children}</h5>;
    case "heading-six":
      return <h6 {...attributes}>{children}</h6>;
    case "link":
      return (
        <SafeLink href={element.url} attributes={attributes}>
          {children}
        </SafeLink>
      );
  }
};

const allowedSchemes = ["http:", "https:", "mailto:", "tel:"];

interface SafeLinkProps {
  attributes: Record<string, unknown>;
  children: React.ReactNode;
  href: string;
}

const SafeLink = ({ children, href, attributes }: SafeLinkProps) => {
  const safeHref = useMemo(() => {
    let parsedUrl: URL | null = null;
    try {
      parsedUrl = new URL(href);
      // eslint-disable-next-line no-empty
    } catch {}
    if (parsedUrl && allowedSchemes.includes(parsedUrl.protocol)) {
      return parsedUrl.href;
    }
    return "about:blank";
  }, [href]);

  return (
    <a href={safeHref} {...attributes}>
      {children}
    </a>
  );
};

const Leaf = ({ attributes, children, leaf }: RenderLeafProps) => {
  if (leaf.bold) {
    children = <strong>{children}</strong>;
  }

  if (leaf.code) {
    children = <code>{children}</code>;
  }

  if (leaf.italic) {
    children = <em>{children}</em>;
  }

  if (leaf.underline) {
    children = <u>{children}</u>;
  }

  if (leaf.strikethrough) {
    children = <del>{children}</del>;
  }

  return <span {...attributes}>{children}</span>;
};

// Default value only used when no HTML is provided
const initialValue: Descendant[] = [
  {
    type: "paragraph",
    children: [{ text: "" }],
  },
];

export default SlateRenderer;
