export interface RegexRule {
  pattern: string;
  category: string;
}

export interface RegexClassifier {
  classify(url: string): string | undefined;
}

interface CompiledRegexRule {
  regex: RegExp;
  category: string;
}

export function createRegexClassifier(rules: RegexRule[]): RegexClassifier {
  const compiledRules = rules.map((rule): CompiledRegexRule => {
    try {
      return {
        regex: new RegExp(rule.pattern),
        category: rule.category,
      };
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);

      throw new Error(`Invalid regex pattern "${rule.pattern}": ${reason}`);
    }
  });

  return {
    classify(url) {
      for (const rule of compiledRules) {
        if (rule.regex.test(url)) {
          return rule.category;
        }
      }

      return undefined;
    },
  };
}
