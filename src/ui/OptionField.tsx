import { useEffect, useState } from "react";
import type { OptionDef } from "../catalog/types";
import { formatValue } from "./summarize";
import { Icon } from "./Icon";

interface Props {
  name: string;
  opt: OptionDef;
  value: unknown;
  error?: string;
  hint?: string;
  onChange: (v: unknown) => void;
}

function parseNumber(text: string, int: boolean): unknown {
  const t = text.trim();
  if (t === "") return undefined;
  const n = Number(t);
  if (Number.isNaN(n) || (int && !Number.isInteger(n))) return text;
  return n;
}

function parseList(text: string, kind: "int" | "float" | "str"): unknown {
  const t = text.trim().replace(/^\[|\]$/g, "");
  if (t === "") return undefined;
  const parts = t.split(",").map((p) => p.trim().replace(/^["']|["']$/g, ""));
  if (kind === "str") return parts.filter(Boolean);
  const nums = parts.map(Number);
  return nums.some((n) => Number.isNaN(n)) ? text : nums;
}

function toText(v: unknown): string {
  if (v === undefined || v === null) return "";
  if (Array.isArray(v)) return v.map((x) => formatValue(x)).join(", ");
  if (typeof v === "number") return formatValue(v);
  return String(v);
}

// A text box that keeps what the user typed, and reports parsed values upward.
function TextInput(props: {
  value: unknown;
  parse: (text: string) => unknown;
  placeholder?: string;
  mono?: boolean;
  list?: string;
  multiline?: boolean;
  invalid?: boolean;
  onChange: (v: unknown) => void;
}) {
  const [text, setText] = useState(toText(props.value));
  const [focused, setFocused] = useState(false);
  useEffect(() => {
    if (!focused) setText(toText(props.value));
  }, [props.value, focused]);
  const common = {
    value: text,
    placeholder: props.placeholder,
    className: `input${props.mono ? " mono" : ""}${props.invalid ? " is-invalid" : ""}`,
    onFocus: () => setFocused(true),
    onBlur: () => setFocused(false),
    spellCheck: false,
  };
  if (props.multiline) {
    return (
      <textarea
        {...common}
        rows={Math.min(10, Math.max(3, text.split("\n").length + 1))}
        onChange={(e) => {
          setText(e.target.value);
          props.onChange(props.parse(e.target.value));
        }}
      />
    );
  }
  return (
    <input
      {...common}
      list={props.list}
      onChange={(e) => {
        setText(e.target.value);
        props.onChange(props.parse(e.target.value));
      }}
    />
  );
}

function defaultLabel(opt: OptionDef): string {
  if (opt.default === undefined) return opt.defaultRepr ? "object" : "";
  return formatValue(opt.default);
}

export function OptionField({ name, opt, value, error, hint, onChange }: Props) {
  const [open, setOpen] = useState(false);
  const isSet = value !== undefined;
  const def = defaultLabel(opt);
  const placeholder = opt.placeholder ?? (def ? `default ${def}` : opt.required ? "required" : "");
  const listId = opt.suggest ? `suggest-${name}` : undefined;

  let control;
  switch (opt.type) {
    case "bool":
    case "system_ref": {
      const on = value === undefined ? opt.default === true : value === true;
      control = (
        <button
          role="switch"
          aria-checked={on}
          className={`switch${on ? " is-on" : ""}${isSet ? "" : " is-default"}`}
          onClick={() => onChange(!on)}
        >
          <span className="switch-knob" />
        </button>
      );
      break;
    }
    case "enum": {
      const values = opt.values ?? [];
      const current = value === undefined ? opt.default : value;
      const short = values.length <= 4 && values.every((v) => formatValue(v).length <= 12);
      control = short ? (
        <div className="segmented" role="radiogroup">
          {values.map((v) => (
            <button
              key={String(v)}
              role="radio"
              aria-checked={current === v}
              className={`seg${current === v ? " is-on" : ""}${isSet ? "" : " is-default"}`}
              onClick={() => onChange(v)}
            >
              {v === null ? "None" : formatValue(v)}
            </button>
          ))}
        </div>
      ) : (
        <select
          className={`input${error ? " is-invalid" : ""}`}
          value={current === undefined ? "" : JSON.stringify(current)}
          onChange={(e) => onChange(e.target.value === "" ? undefined : JSON.parse(e.target.value))}
        >
          {current === undefined && <option value="">—</option>}
          {values.map((v) => (
            <option key={String(v)} value={JSON.stringify(v)}>
              {v === null ? "None" : formatValue(v)}
            </option>
          ))}
        </select>
      );
      break;
    }
    case "int":
    case "float":
      control = (
        <TextInput
          value={value}
          mono
          placeholder={placeholder}
          invalid={!!error}
          parse={(t) => parseNumber(t, opt.type === "int")}
          onChange={onChange}
        />
      );
      break;
    case "list[int]":
    case "list[float]":
    case "list[str]":
      control = (
        <TextInput
          value={value}
          mono
          placeholder={placeholder || "comma-separated"}
          invalid={!!error}
          parse={(t) => parseList(t, opt.type.slice(5, -1) as "int" | "float" | "str")}
          onChange={onChange}
        />
      );
      break;
    case "text":
      control = (
        <TextInput
          value={value}
          mono
          multiline
          placeholder={placeholder}
          invalid={!!error}
          parse={(t) => (t.trim() === "" ? undefined : t)}
          onChange={onChange}
        />
      );
      break;
    default:
      control = (
        <TextInput
          value={value}
          mono={opt.type === "py"}
          list={listId}
          placeholder={placeholder}
          invalid={!!error}
          parse={(t) => (t.trim() === "" ? undefined : t)}
          onChange={onChange}
        />
      );
  }

  return (
    <div className={`field${error ? " has-error" : ""}`}>
      <div className="field-head">
        <label className="field-name">
          {name}
          {opt.required && <span className="req">required</span>}
          {opt.type === "py" && <span className="tag">Python</span>}
        </label>
        {isSet && !opt.required && (
          <button className="icon-btn tiny" title="Reset to default" onClick={() => onChange(undefined)}>
            <Icon name="undo" size={12} />
          </button>
        )}
      </div>
      {control}
      {listId && (
        <datalist id={listId}>
          {opt.suggest!.map((s) => (
            <option key={s} value={s} />
          ))}
        </datalist>
      )}
      {error && <div className="field-error">{error}</div>}
      {hint && !error && <div className="field-hint">{hint}</div>}
      {opt.doc && (
        <div className={`field-doc${open ? " is-open" : ""}`} onClick={() => setOpen(!open)}>
          {opt.doc}
        </div>
      )}
    </div>
  );
}
