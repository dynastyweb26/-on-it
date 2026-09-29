// Which deployment environment this server code is running in. Preview and
// production share one database, so rows that must stay per-environment (push
// subscriptions) are tagged with this value.
export type DeployEnv = 'production' | 'preview' | 'development';

export function deployEnv(): DeployEnv {
  const v = process.env.VERCEL_ENV;
  return v === 'production' || v === 'preview' ? v : 'development';
}
