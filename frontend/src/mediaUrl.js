export function mediaUrl(API, path) {
  if (!path) return '';
  return path.startsWith('http') ? path : API + path;
}
