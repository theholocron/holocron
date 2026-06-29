export type CapabilityKey =
  | 'sourceControl'
  | 'ci'
  | 'issues'
  | 'platformSecrets'
  | 'hosting'
  | 'dataStore'
  | 'auth'
  | 'envSecrets'
  | 'apiTooling'
  | 'notifications'
  | 'analytics'

export interface Capability<K extends CapabilityKey = CapabilityKey> {
  readonly key: K
  readonly providerName: string
}

export interface SourceControl extends Capability<'sourceControl'> {
  getRepo(): Promise<{ owner: string; name: string; defaultBranch: string }>
}

export interface Ci extends Capability<'ci'> {
  listWorkflows(): Promise<Array<{ name: string; path: string }>>
}

export interface Issues extends Capability<'issues'> {
  create(input: { title: string; body?: string; labels?: string[] }): Promise<{ id: string | number; url: string }>
}

export interface PlatformSecrets extends Capability<'platformSecrets'> {
  upsert(name: string, value: string): Promise<void>
}

export interface Hosting extends Capability<'hosting'> {
  listProjects(): Promise<Array<{ id: string; name: string }>>
}

export interface DataStore extends Capability<'dataStore'> {
  getConnectionString(env: 'local' | 'preview' | 'production'): Promise<string>
}

export interface Auth extends Capability<'auth'> {
  describe(): Promise<{ provider: string; envKeys: string[] }>
}

export interface EnvSecrets extends Capability<'envSecrets'> {
  read(reference: string): Promise<string>
  write(reference: string, value: string): Promise<void>
}

export interface ApiTooling extends Capability<'apiTooling'> {
  sync(): Promise<void>
}

export interface Notifications extends Capability<'notifications'> {
  send(channel: string, message: string): Promise<void>
}

export interface Analytics extends Capability<'analytics'> {
  describe(): Promise<{ provider: string; dsnEnvKey: string }>
}

export interface CapabilityMap {
  sourceControl: SourceControl
  ci: Ci
  issues: Issues
  platformSecrets: PlatformSecrets
  hosting: Hosting
  dataStore: DataStore
  auth: Auth
  envSecrets: EnvSecrets
  apiTooling: ApiTooling
  notifications: Notifications
  analytics: Analytics
}
