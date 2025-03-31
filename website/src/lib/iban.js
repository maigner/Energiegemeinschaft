export function isValidIBAN(iban) {
    // Remove spaces and convert to uppercase
    iban = iban.replace(/\s+/g, "").toUpperCase();

    // IBAN must be between 15 and 34 characters long
    if (iban.length < 15 || iban.length > 34) {
        return false;
    }

    // Move the first four characters to the end
    const rearranged = iban.slice(4) + iban.slice(0, 4);

    // Convert letters to numbers (A = 10, B = 11, ..., Z = 35)
    const numericIBAN = rearranged
        .split("")
        .map((char) =>
            char >= "A" && char <= "Z" ? char.charCodeAt(0) - 55 : char,
        )
        .join("");

    // Perform mod 97 check
    return BigInt(numericIBAN) % 97n === 1n;
}

export function formatIBAN(iban) {
    // Remove all non-alphanumeric characters and convert to uppercase
    iban = iban.replace(/\W+/g, "").toUpperCase();

    // Add spaces every 4 characters
    return iban.replace(/(.{4})/g, "$1 ").trim();
}