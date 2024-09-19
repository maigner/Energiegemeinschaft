
export function formatDate(date: Date): string {
    if (typeof date === "undefined") {
        return "";
    }
    const day: string = String(date.getDate()).padStart(2, '0');
    const month: string = String(date.getMonth() + 1).padStart(2, '0'); // Months are 0-based
    const year: number = date.getFullYear();

    return `${day}.${month}.${year}`;
}