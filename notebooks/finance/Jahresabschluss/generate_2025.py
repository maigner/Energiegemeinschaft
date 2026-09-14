#!/usr/bin/env python3
"""
Jahresabschluss 2025 für EEG
Generiert automatisch den Jahresabschluss aus der Django-Datenbank
"""

import os
import sys
import django
from datetime import date

os.chdir('/home/martin/Workspace/Energiegemeinschaft/middleware/eeg')

venv_path = '/home/martin/Workspace/Energiegemeinschaft/.venv/lib/python3.12/site-packages'
middleware_path = '/home/martin/Workspace/Energiegemeinschaft/middleware/eeg'

if venv_path not in sys.path:
    sys.path.insert(0, venv_path)
if middleware_path not in sys.path:
    sys.path.insert(0, middleware_path)

os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'eeg.settings')

from django.conf import settings
if not settings.configured:
    django.setup()

from accounting.models import Booking, BookingLabel
from django.db.models import Sum, Count, Q
from django.db.models.functions import ExtractMonth, ExtractYear

import pandas as pd
import numpy as np


def get_bookings_2025():
    """Lädt alle Buchungen für 2025 aus der Datenbank
    
    Verwendet payment_date, wenn das Bankdatum falsch ist.
    """
    bookings = Booking.objects.filter(
        Q(payment_date__year=2025) | 
        (Q(payment_date__isnull=True) & Q(booking_date__year=2025))
    ).order_by('booking_date', 'booking_reference')
    return bookings


def create_dataframe(bookings):
    """Erstellt einen DataFrame aus den Buchungen"""
    data = []
    for booking in bookings:
        effective_date = booking.payment_date if booking.payment_date else booking.booking_date
        row = {
            'Buchungsdatum': booking.booking_date,
            'Zahlungsdatum': booking.payment_date,
            'Valutadatum': booking.value_date,
            'Partnername': booking.partner_name or '',
            'Partner IBAN': booking.partner_iban or '',
            'Buchungs-Details': booking.booking_details or '',
            'Betrag': float(booking.amount),
            'Währung': booking.currency or '',
            'Buchungsreferenz': booking.booking_reference or '',
            'Eigener Kontoname': booking.account_name or '',
            'Eigene IBAN': booking.iban or '',
            'Jahr': effective_date.year,
        }
        labels = booking.labels.all()
        row['Labels'] = ', '.join([label.label for label in labels])
        row['Label Count'] = labels.count()
        data.append(row)
    df = pd.DataFrame(data)
    df['Buchungsdatum'] = pd.to_datetime(df['Buchungsdatum'])
    df['Zahlungsdatum'] = pd.to_datetime(df['Zahlungsdatum'])
    df['Valutadatum'] = pd.to_datetime(df['Valutadatum'])
    return df


def generate_jahresabschluss():
    """Generiert den vollständigen Jahresabschluss 2025"""
    print("Lade Buchungen für 2025...")
    bookings = get_bookings_2025()
    print(f"Gefunden: {bookings.count()} Buchungen")
    df = create_dataframe(bookings)
    
    total_income = df[df['Betrag'] > 0]['Betrag'].sum()
    total_expenses = df[df['Betrag'] < 0]['Betrag'].sum()
    net_balance = total_income + total_expenses
    
    start_2025 = date(2025, 1, 1)
    prior_bookings = Booking.objects.filter(
        Q(payment_date__lt=start_2025) | 
        (Q(payment_date__isnull=True) & Q(booking_date__lt=start_2025))
    )
    prior_balance = prior_bookings.aggregate(total=Sum('amount'))['total'] or 0
    prior_balance = float(prior_balance)
    final_balance = prior_balance + net_balance
    
    print(f"\n=== JAHRESABSCHLUSS 2025 ===")
    print(f"Einnahmen: {total_income:,.2f} EUR")
    print(f"Ausgaben: {total_expenses:,.2f} EUR")
    print(f"Saldo 2025: {net_balance:,.2f} EUR")
    print(f"Kontostand vor 2025: {prior_balance:,.2f} EUR")
    print(f"Finaler Kontostand: {final_balance:,.2f} EUR")
    
    print("\n=== ALLE BUCHUNGEN ===")
    print(df[['Buchungsdatum', 'Partnername', 'Betrag', 'Buchungs-Details', 'Labels']].to_string())
    
    print("\n=== NACH PARTNER GRUPPIERT ===")
    partner_summary = df.groupby('Partnername').agg({'Betrag': ['count', 'sum']}).round(2)
    partner_summary.columns = ['Anzahl', 'Summe']
    partner_summary = partner_summary.sort_values('Summe', ascending=False)
    print(partner_summary.to_string())
    
    print("\n=== NACH MONAT ===")
    df['Monat'] = df['Zahlungsdatum'].fillna(df['Buchungsdatum']).dt.month
    df['Monatsname'] = df['Zahlungsdatum'].fillna(df['Buchungsdatum']).dt.strftime('%B')
    monthly_summary = df.groupby('Monatsname').agg({'Betrag': ['count', 'sum']}).round(2)
    monthly_summary.columns = ['Anzahl', 'Summe']
    month_order = ['Januar', 'Februar', 'März', 'April', 'Mai', 'Juni', 'Juli', 'August', 'September', 'Oktober', 'November', 'Dezember']
    monthly_summary = monthly_summary.reindex([m for m in month_order if m in monthly_summary.index])
    print(monthly_summary.to_string())
    
    print("\n=== NACH LABELS GRUPPIERT ===")
    labeled_df = df[df['Labels'] != ''].copy()
    if not labeled_df.empty:
        labeled_df['Label'] = labeled_df['Labels'].str.split(', ')
        exploded = labeled_df.explode('Label')
        label_summary = exploded.groupby('Label').agg({'Betrag': ['count', 'sum']}).round(2)
        label_summary.columns = ['Anzahl', 'Summe']
        label_summary = label_summary.sort_values('Summe', ascending=False)
        print(label_summary.to_string())
    
    print("\n=== EINNAHMEN (Top 10) ===")
    income_df = df[df['Betrag'] > 0].sort_values('Betrag', ascending=False)
    print(income_df[['Buchungsdatum', 'Partnername', 'Betrag', 'Buchungs-Details']].head(10).to_string())
    
    print("\n=== AUSGABEN (Top 10) ===")
    expenses_df = df[df['Betrag'] < 0].sort_values('Betrag', ascending=True)
    print(expenses_df[['Buchungsdatum', 'Partnername', 'Betrag', 'Buchungs-Details']].head(10).to_string())
    
    return {
        'df': df, 'total_income': total_income, 'total_expenses': total_expenses,
        'net_balance': net_balance, 'prior_balance': prior_balance, 'final_balance': final_balance,
        'partner_summary': partner_summary, 'monthly_summary': monthly_summary,
        'label_summary': label_summary if not labeled_df.empty else None,
        'income_df': income_df, 'expenses_df': expenses_df
    }


def save_to_excel(results, filename):
    """Speichert die Ergebnisse in einer Excel-Datei"""
    with pd.ExcelWriter(filename, engine='openpyxl') as writer:
        results['df'].to_excel(writer, sheet_name='Alle Buchungen', index=False)
        summary_df = pd.DataFrame({
            'Kategorie': ['Einnahmen', 'Ausgaben', 'Saldo 2025', 'Kontostand vor 2025', 'Finaler Kontostand'],
            'Betrag': [results['total_income'], results['total_expenses'], results['net_balance'],
                      results['prior_balance'], results['final_balance']]
        })
        summary_df.to_excel(writer, sheet_name='Zusammenfassung', index=False)
        results['partner_summary'].to_excel(writer, sheet_name='Nach Partner', index=True)
        results['monthly_summary'].to_excel(writer, sheet_name='Nach Monat', index=True)
        if results['label_summary'] is not None:
            results['label_summary'].to_excel(writer, sheet_name='Nach Labels', index=True)
        results['income_df'].to_excel(writer, sheet_name='Einnahmen', index=False)
        results['expenses_df'].to_excel(writer, sheet_name='Ausgaben', index=False)
    print(f"\nJahresabschluss wurde in '{filename}' gespeichert!")


if __name__ == '__main__':
    results = generate_jahresabschluss()
    output_dir = '/home/martin/Workspace/Energiegemeinschaft/notebooks/finance/Jahresabschluss/2025'
    os.makedirs(output_dir, exist_ok=True)
    output_file = os.path.join(output_dir, '2025-01-01_2025-12-31.xlsx')
    save_to_excel(results, output_file)
    print("\nFertig!")
