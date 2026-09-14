/**
 * Checks whether an added line contains a hardcoded local workstation path.
 *
 * @param line - The raw content of the added line.
 * @returns An explanation string if matched, or null if clean.
 */
export function matchPathMiasma(line: string): string | null {
  // POSIX home directory pattern: /home/<user>/ or /Users/<user>/
  const posixHome = /(?:^|[\s"'`(=])(?:file:\/\/)?\/(?:home|Users)\/[a-zA-Z0-9._-]+\//
  if (posixHome.test(line)) {
    return 'Hardcoded workstation absolute home directory path'
  }

  // Windows user profile directory pattern: C:\Users\<user>\
  const windowsHome = /(?:^|[\s"'`(=])[a-zA-Z]:\\(?:\\)?Users\\(?:\\)?[a-zA-Z0-9._-]+\\/i
  if (windowsHome.test(line)) {
    return 'Hardcoded Windows workstation user directory path'
  }

  return null
}
