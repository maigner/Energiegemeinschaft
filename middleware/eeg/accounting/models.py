from django.db import models

class BookingLabel(models.Model):
    label = models.CharField(max_length=100, verbose_name="Label")
    color = models.CharField(max_length=20, verbose_name="Color")
    parent = models.ForeignKey(
        'self', 
        on_delete=models.SET_NULL, 
        null=True, 
        blank=True, 
        related_name='children'
    )
    
    def __str__(self):
        return self.label


# based on George CSV Export
class Booking(models.Model):
    account_name = models.CharField(max_length=255)  # "Eigener Kontoname"
    iban = models.CharField(max_length=34)  # "Eigene IBAN", IBAN max length is 34 characters
    booking_date = models.DateField()  # "Buchungsdatum"
    partner_name = models.CharField(max_length=255)  # "Partnername"
    partner_iban = models.CharField(max_length=34)  # "Partner IBAN"
    bic_swift = models.CharField(max_length=11)  # "BIC/SWIFT", max length is 8-11 characters
    partner_account_number = models.CharField(max_length=34)  # "Partner Kontonummer"
    bank_code = models.CharField(max_length=11)  # "Bankleitzahl", typical max length for bank codes
    amount = models.DecimalField(max_digits=12, decimal_places=2)  # "Betrag"
    currency = models.CharField(max_length=3)  # "Währung", standard ISO currency codes have 3 characters
    booking_details = models.TextField()  # "Buchungs-Details"
    booking_reference = models.CharField(max_length=255)  # "Buchungsreferenz"
    note = models.TextField(null=True, blank=True)  # "Notiz", can be empty
    highlight = models.BooleanField(default=False)  # "Highlight", assuming this is a flag or boolean field
    value_date = models.DateField()  # "Valutadatum"
    virtual_card_number = models.CharField(max_length=19, null=True, blank=True)  # "Virtuelle Kartennummer", credit card number length is up to 19
    paid_with = models.CharField(max_length=255, null=True, blank=True)  # "Bezahlt mit"
    app = models.CharField(max_length=255, null=True, blank=True)  # "App"
    payment_reference = models.CharField(max_length=255, null=True, blank=True)  # "Zahlungsreferenz"
    mandate_id = models.CharField(max_length=255, null=True, blank=True)  # "Mandats ID"
    creditor_id = models.CharField(max_length=255, null=True, blank=True)  # "Creditor ID"
    labels = models.ManyToManyField(BookingLabel, related_name="bookings", blank=True, verbose_name="Labels")

    class Meta:
        unique_together = (
            'booking_date', 'partner_iban', 'amount', 'currency',
            'booking_details', 'value_date', 'mandate_id',
            'creditor_id', 'payment_reference', 'booking_reference'
        )

    def __str__(self):
        return f'Booking {self.booking_reference} - {self.partner_name}'


