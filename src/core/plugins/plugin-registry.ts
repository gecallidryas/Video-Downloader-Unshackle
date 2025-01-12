import type {
  DetectorPlugin,
  DetectorPluginMatchContext,
} from './detector-plugin';

export interface PluginRegistry {
  all(): DetectorPlugin[];
  get(id: string): DetectorPlugin | undefined;
  match(context: { url: URL; document?: Document }): DetectorPlugin[];
}

function normalizeHost(value: string): string {
  const host = value.trim().toLowerCase();

  return host.startsWith('www.') ? host.slice(4) : host;
}

function domainMatches(host: string, domain: string): boolean {
  const normalizedHost = normalizeHost(host);
  const normalizedDomain = normalizeHost(domain);

  return (
    normalizedHost === normalizedDomain ||
    normalizedHost.endsWith(`.${normalizedDomain}`)
  );
}

function pluginMatches(
  plugin: DetectorPlugin,
  context: DetectorPluginMatchContext,
): boolean {
  if (!plugin.domains.some((domain) => domainMatches(context.host, domain))) {
    return false;
  }

  return plugin.matches ? plugin.matches(context) : true;
}

export function createPluginRegistry(plugins: DetectorPlugin[]): PluginRegistry {
  const orderedPlugins = [...plugins];
  const pluginsById = new Map(
    orderedPlugins.map((plugin) => [plugin.id, plugin]),
  );

  return {
    all() {
      return [...orderedPlugins];
    },
    get(id) {
      return pluginsById.get(id);
    },
    match(context) {
      const host = normalizeHost(context.url.hostname);

      return orderedPlugins.filter((plugin) =>
        pluginMatches(plugin, {
          url: context.url,
          host,
          document: context.document,
        }),
      );
    },
  };
}
