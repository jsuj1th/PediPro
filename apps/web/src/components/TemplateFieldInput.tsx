import type { TemplateField } from '../lib/types';

type Props = {
  field: TemplateField;
  value: any;
  onChange: (value: any) => void;
  error?: string;
};

export function TemplateFieldInput({ field, value, onChange, error }: Props) {
  const inputType = field.input_type;

  const renderInput = () => {
    if (inputType === 'radio') {
      return (
        <div style={{ display: 'grid', gap: 8 }}>
          {(field.options ?? []).map((option) => (
            <label key={option} style={{ display: 'flex', alignItems: 'center', gap: 8, fontWeight: 500 }}>
              <input
                type="radio"
                name={field.field_id}
                checked={String(value ?? '') === option}
                onChange={() => onChange(option)}
                style={{ width: 18, height: 18 }}
              />
              <span>{option}</span>
            </label>
          ))}
        </div>
      );
    }

    if (inputType === 'select') {
      return (
        <select value={value ?? ''} onChange={(event) => onChange(event.target.value)}>
          <option value="">Select...</option>
          {(field.options ?? []).map((option) => (
            <option key={option} value={option}>
              {option}
            </option>
          ))}
        </select>
      );
    }

    if (inputType === 'textarea' || inputType === 'json' || inputType === 'signature') {
      return (
        <textarea
          value={
            inputType === 'json'
              ? typeof value === 'string'
                ? value
                : value == null
                  ? ''
                  : JSON.stringify(value, null, 2)
              : (value ?? '')
          }
          onChange={(event) => {
            if (inputType === 'json') {
              const raw = event.target.value;
              if (!raw.trim()) {
                onChange([]);
                return;
              }
              try {
                const parsed = JSON.parse(raw);
                onChange(parsed);
              } catch {
                onChange(raw);
              }
              return;
            }
            onChange(event.target.value);
          }}
        />
      );
    }

    if (inputType === 'checkbox') {
      return (
        <input
          type="checkbox"
          checked={Boolean(value)}
          onChange={(event) => onChange(event.target.checked)}
          style={{ width: 24, height: 24 }}
        />
      );
    }

    return (
      <input
        type={inputType === 'number' ? 'number' : inputType === 'signature' ? 'text' : inputType}
        value={value ?? ''}
        onChange={(event) => {
          if (inputType === 'number') {
            const num = event.target.value === '' ? '' : Number(event.target.value);
            onChange(num);
            return;
          }
          onChange(event.target.value);
        }}
      />
    );
  };

  return (
    <div className="field">
      <label htmlFor={field.field_id}>
        {field.label}
        {field.required ? ' *' : ''}
      </label>
      {renderInput()}
      {error ? <div className="error">{error}</div> : null}
    </div>
  );
}
