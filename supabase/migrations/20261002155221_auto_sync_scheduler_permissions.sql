-- Keep the installed extension intact; only postgres dispatches scheduled HTTP requests.
revoke all on schema net from public, anon, authenticated;
revoke all on all tables in schema net from public, anon, authenticated;
revoke all on all sequences in schema net from public, anon, authenticated;
revoke all on all functions in schema net from public, anon, authenticated;
