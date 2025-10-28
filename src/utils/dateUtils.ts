/**
 * Firebase Date 객체를 로컬 날짜 문자열로 변환
 * @param date Firebase Date 객체 또는 Date 객체
 * @returns YYYY-MM-DD 형식의 로컬 날짜 문자열
 */
export function toLocalDateString(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

/**
 * Firebase Date 객체를 로컬 날짜 문자열로 변환 (시간 포함)
 * @param date Firebase Date 객체 또는 Date 객체
 * @returns YYYY-MM-DD HH:MM:SS 형식의 로컬 날짜시간 문자열
 */
export function toLocalDateTimeString(date: Date): string {
  const dateStr = toLocalDateString(date);
  const timeStr = `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}:${String(date.getSeconds()).padStart(2, '0')}`;
  return `${dateStr} ${timeStr}`;
}

/**
 * 두 날짜가 같은 로컬 날짜인지 확인
 * @param date1 첫 번째 날짜
 * @param date2 두 번째 날짜
 * @returns 같은 날짜면 true
 */
export function isSameLocalDate(date1: Date, date2: Date): boolean {
  return toLocalDateString(date1) === toLocalDateString(date2);
}

/**
 * Firebase Timestamp를 로컬 Date로 안전하게 변환
 * @param timestamp Firebase Timestamp 또는 Date
 * @returns 로컬 Date 객체
 */
export function toLocalDate(timestamp: any): Date {
  if (!timestamp) return new Date();
  
  if (timestamp.toDate && typeof timestamp.toDate === 'function') {
    // Firebase Timestamp
    return timestamp.toDate();
  } else if (timestamp instanceof Date) {
    // 이미 Date 객체
    return timestamp;
  } else {
    // 문자열이나 다른 형태
    return new Date(timestamp);
  }
}
