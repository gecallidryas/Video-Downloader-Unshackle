// DASH $Identifier$ template substitution per ISO/IEC 23009-1. Identifiers may
// carry a printf-style zero-pad width ($Number%05d$) and the literal sequence
// $$ escapes a single dollar sign. Tokens are substituted across two stages
// (parse-time for the fixed $RepresentationID$/$Bandwidth$, plan-time for the
// per-segment $Number$/$Time$), so the $$ escape is preserved until both stages
// have run and only collapsed once, by collapseDollarEscape.

export type DashTemplateValues = Record<string, number | string | undefined>;

function pad(value: number | string, width: string | undefined): string {
  const text = String(value);

  return width ? text.padStart(Number(width), '0') : text;
}

export function substituteDashTokens(
  template: string,
  values: DashTemplateValues,
): string {
  return template.replace(
    /\$\$|\$([A-Za-z]+)(?:%0(\d+)d)?\$/g,
    (match, identifier: string | undefined, width: string | undefined) => {
      if (match === '$$') {
        return match;
      }

      const value = identifier ? values[identifier] : undefined;

      return value === undefined ? match : pad(value, width);
    },
  );
}

export function collapseDollarEscape(template: string): string {
  return template.replace(/\$\$/g, '$');
}
