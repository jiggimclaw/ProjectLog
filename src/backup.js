function pad(value) {
  return String(value).padStart(2, '0');
}

export function buildBackupFilename(date = new Date()) {
  if (!(date instanceof Date) || Number.isNaN(date.getTime())) {
    throw new TypeError('Für den Backup-Dateinamen ist ein gültiges Datum erforderlich.');
  }

  const day = `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
  const time = `${pad(date.getHours())}-${pad(date.getMinutes())}-${pad(date.getSeconds())}`;
  return `ProjectLog_Backup_${day}_${time}.json`;
}
