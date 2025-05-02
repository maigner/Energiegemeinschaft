
export function formatDate(date: Date): string {
  if (typeof date === "undefined") {
    return "";
  }
  const day: string = String(date.getDate()).padStart(2, '0');
  const month: string = String(date.getMonth() + 1).padStart(2, '0'); // Months are 0-based
  const year: number = date.getFullYear();

  return `${day}.${month}.${year}`;
}


export function shortenString(str, maxLength) {
  // Check if the string needs to be shortened
  if (str.length <= maxLength) {
    return str;
  }

  // Calculate how much to keep from the start and end
  const partLength = Math.floor((maxLength - 3) / 2);

  // Return the shortened string in the format "start ... end"
  return str.slice(0, partLength) + '...' + str.slice(-partLength);
}
