import { useMemo, useState } from 'react';
import { isValidYaml, parseFrontmatter, stringifyFrontmatter } from '../lib/mdx';
import type { FrontmatterField, FrontmatterFieldType } from '../lib/types';

interface Props {
  text: string;
  onChange: (text: string) => void;
  fields: FrontmatterField[];
  assets: string[];
}

function toDateInput(value: unknown): string {
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  const parsed = typeof value === 'string' ? new Date(value) : null;
  if (parsed && !Number.isNaN(parsed.getTime())) return parsed.toISOString().slice(0, 10);
  return '';
}

function inferType(value: unknown): FrontmatterFieldType {
  if (typeof value === 'boolean') return 'boolean';
  if (typeof value === 'number') return 'number';
  if (Array.isArray(value)) return 'list';
  if (value instanceof Date) return 'date';
  if (value && typeof value === 'object') return 'object';
  return 'string';
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value) && !(value instanceof Date);
}

export function FrontmatterForm({ text, onChange, fields, assets }: Props) {
  const [rawMode, setRawMode] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  const data = useMemo(() => parseFrontmatter(text), [text]);
  const valid = isValidYaml(text);

  const extraFields: FrontmatterField[] = Object.keys(data)
    .filter((key) => !fields.some((field) => field.key === key))
    .map((key) => ({ key, label: key, type: inferType(data[key]) }));

  const update = (key: string, value: unknown) => {
    onChange(stringifyFrontmatter({ ...data, [key]: value }));
  };

  /** Replace one key inside an object-valued field, leaving its siblings alone. */
  const updateNested = (key: string, subKey: string, value: unknown) => {
    const current = isRecord(data[key]) ? data[key] : {};
    update(key, { ...current, [subKey]: value });
  };

  const counter = (field: FrontmatterField, value: unknown) => {
    if (!field.maxLength) return null;
    const length = String(value ?? '').length;
    return (
      <span className={`counter ${length > field.maxLength ? 'is-over' : ''}`}>
        {length} / {field.maxLength}
      </span>
    );
  };

  const renderField = (field: FrontmatterField) => {
    const value = data[field.key];
    const label = field.label ?? field.key;
    const id = `fm-${field.key}`;

    switch (field.type) {
      case 'boolean':
        return (
          <label key={field.key} className="fm-field fm-check">
            <input type="checkbox" checked={value === true} onChange={(e) => update(field.key, e.target.checked)} />
            <span>{label}</span>
          </label>
        );
      case 'text':
        return (
          <div key={field.key} className="fm-field fm-wide">
            <label htmlFor={id}>
              {label}
              {counter(field, value)}
            </label>
            <textarea id={id} rows={2} value={String(value ?? '')} onChange={(e) => update(field.key, e.target.value)} />
          </div>
        );
      case 'date':
        return (
          <div key={field.key} className="fm-field">
            <label htmlFor={id}>{label}</label>
            <input
              id={id}
              type="date"
              value={toDateInput(value)}
              // Stored as a Date so YAML emits a timestamp. A quoted string fails
              // schemas that use z.date() rather than z.coerce.date().
              onChange={(e) =>
                update(field.key, e.target.value ? new Date(`${e.target.value}T00:00:00Z`) : undefined)
              }
            />
          </div>
        );
      case 'list':
        return (
          <div key={field.key} className="fm-field fm-wide">
            <label htmlFor={id}>{label} <span className="muted">comma separated</span></label>
            <input
              id={id}
              value={Array.isArray(value) ? value.join(', ') : String(value ?? '')}
              onChange={(e) =>
                update(field.key, e.target.value.split(',').map((part) => part.trim()).filter(Boolean))
              }
            />
          </div>
        );
      case 'number':
        return (
          <div key={field.key} className="fm-field">
            <label htmlFor={id}>{label}</label>
            <input
              id={id}
              type="number"
              value={typeof value === 'number' ? value : ''}
              onChange={(e) => update(field.key, e.target.value === '' ? undefined : Number(e.target.value))}
            />
          </div>
        );
      case 'image':
        return (
          <div key={field.key} className="fm-field">
            <label htmlFor={id}>{label}</label>
            <input id={id} list="fm-assets" value={String(value ?? '')} onChange={(e) => update(field.key, e.target.value)} />
          </div>
        );
      case 'object': {
        const record = isRecord(value) ? value : {};
        // Declared sub-fields win; otherwise take the keys the document already has.
        const subFields: FrontmatterField[] =
          field.fields ?? Object.keys(record).map((k) => ({ key: k, label: k, type: inferType(record[k]) }));

        return (
          <fieldset key={field.key} className="fm-field fm-wide fm-object">
            <legend>{label}</legend>
            {subFields.length ? (
              subFields.map((sub) => (
                <div key={sub.key} className="fm-sub">
                  <label htmlFor={`${id}-${sub.key}`}>
                    {sub.label ?? sub.key}
                    {counter(sub, record[sub.key])}
                  </label>
                  <input
                    id={`${id}-${sub.key}`}
                    value={String(record[sub.key] ?? '')}
                    list={sub.type === 'image' ? 'fm-assets' : undefined}
                    onChange={(e) => updateNested(field.key, sub.key, e.target.value)}
                  />
                </div>
              ))
            ) : (
              <p className="muted">Empty — edit as raw YAML to add keys.</p>
            )}
          </fieldset>
        );
      }
      default:
        return (
          <div key={field.key} className="fm-field">
            <label htmlFor={id}>
              {label}
              {counter(field, value)}
            </label>
            <input id={id} value={String(value ?? '')} onChange={(e) => update(field.key, e.target.value)} />
          </div>
        );
    }
  };

  return (
    <section className={`frontmatter ${collapsed ? 'is-collapsed' : ''}`}>
      <header>
        <button type="button" className="disclosure" onClick={() => setCollapsed((c) => !c)}>
          <span className={`chevron ${collapsed ? '' : 'open'}`}>▸</span> Frontmatter
        </button>
        {!valid && <span className="badge badge-warn">invalid YAML</span>}
        <button type="button" className="link" onClick={() => setRawMode((r) => !r)}>
          {rawMode ? 'Form' : 'Raw YAML'}
        </button>
      </header>

      {!collapsed &&
        (rawMode || !valid ? (
          <textarea className="fm-raw" rows={8} value={text} onChange={(e) => onChange(e.target.value)} spellCheck={false} />
        ) : (
          <div className="fm-grid">
            {fields.map(renderField)}
            {extraFields.map(renderField)}
            <datalist id="fm-assets">
              {assets.map((asset) => (
                <option key={asset} value={asset} />
              ))}
            </datalist>
          </div>
        ))}
    </section>
  );
}
