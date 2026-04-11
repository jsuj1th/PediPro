export type TemplateField = {
  field_id: string;
  label: string;
  input_type: string;
  required?: boolean;
  options?: string[];
  validation_rules?: Record<string, unknown>;
};

export type TemplateStep = {
  step_id: string;
  title: string;
  description?: string;
  fields: TemplateField[];
};

export type FormTemplate = {
  submission_id?: string;
  form_id: string;
  version: string;
  title: string;
  steps: TemplateStep[];
  responses?: Record<string, unknown>;
};
