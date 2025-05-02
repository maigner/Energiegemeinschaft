export function isValidMeasurementPointIdentifier(identifier) {
    const pattern = /^AT003000\d{25}$/;  // AT003000 + 25 digits
    return pattern.test(identifier);
}