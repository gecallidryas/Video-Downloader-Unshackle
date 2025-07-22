const SAFE_VARIABLES = [
  'url',
  'filename',
  'title',
  'quality',
  'extension',
  'duration',
  'filesize',
] as const;

const SENSITIVE_VARIABLES = [
  'cookie',
  'authorization',
  'referer',
  'origin',
] as const;

type SafeVariable = typeof SAFE_VARIABLES[number];
type SensitiveVariable = typeof SENSITIVE_VARIABLES[number];
type TemplateVariable = SafeVariable | SensitiveVariable;

export type TemplateVariables = Partial<Record<TemplateVariable, string | number>>;

export interface TemplateRenderOptions {
  advancedMode?: boolean;
}

const SAFE_VARIABLE_SET = new Set<string>(SAFE_VARIABLES);
const SENSITIVE_VARIABLE_SET = new Set<string>(SENSITIVE_VARIABLES);

export function renderTemplate(
  template: string,
  variables: TemplateVariables,
  options: TemplateRenderOptions = {},
): string {
  return template.replace(/\{([A-Za-z][A-Za-z0-9_]*)\}/g, (token, name: string) => {
    const isSafe = SAFE_VARIABLE_SET.has(name);
    const isAllowedSensitive = options.advancedMode === true && SENSITIVE_VARIABLE_SET.has(name);

    if ((!isSafe && !isAllowedSensitive) || !(name in variables)) {
      return token;
    }

    const value = variables[name as TemplateVariable];

    return value === undefined ? token : String(value);
  });
}

export function listSafeVariables(): string[] {
  return [...SAFE_VARIABLES];
}

export function listAllVariables(): string[] {
  return [...SAFE_VARIABLES, ...SENSITIVE_VARIABLES];
}
