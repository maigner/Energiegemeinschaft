#!/usr/bin/env python3
"""
Jahresabschluss 2025 für EEG
Generiert automatisch den Jahresabschluss aus der Django-Datenbank
"""

import os
import sys
import django
from datetime import date

# Ändere das Arbeitsverzeichnis zu middleware/eeg, damit Django die .pg_service.conf findet
os.chdir('/home/martin/Workspace/Energiegemeinschaft/middleware/eeg')

# Füge die venv und middleware zum PATH hinzu
venv_path = '/home/martin/Workspace/Energiegemeinschaft/.venv/lib/python3.12/site-packages'
middleware_path = '/home/martin/Workspace/Energiegemeinschaft/middleware/eeg'

if venv_path not in sys.path:
    sys.path.insert(0, venv_path)
if middleware_path not in sys.path:
    sys.path.insert(0, middleware_path)

os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'eeg.settings')

# Setup Django
from django.conf import settings
if not settings.configured:
    django.setup()

from accounting.models import Booking, BookingLabel
from django.db.models import Sum, Count, Q
from django.db.models.functions import ExtractMonth, ExtractYear

import pandas as pd
import numpy as np


def get_bookings_2025():
    """Lädt alle Buchungen für 2025 aus der Datenbank"""
    start_date = date(2025, 1, 1)
    end_date = date(2025, 12, 31)
    
    bookings = Booking.objects.filter(
        booking_date__year=2025
    ).order_by('booking_date', 'booking_reference')
    
    return bookings


def create_dataframe(bookings):
    """Erstellt einen DataFrame aus den Buchungen"""
    data = []
    
    for booking in bookings:
        row = {
            'Buchungsdatum': booking.booking_date,
            'Valutadatum': booking.value_date,
            'Partnername': booking.partner_name or '',
            'Partner IBAN': booking.partner_iban or '',
            'Buchungs-Details': booking.booking_details or '',
            'Betrag': float(booking.amount),
            'Währung': booking.currency or '',
            'Buchungsreferenz': booking.booking_reference or '',
            'Eigener Kontoname': booking.account_name or '',
            'Eigene IBAN': booking.iban or '',
        }
        # Labels
        labels = booking.labels.all()
        row['Labels'] = ', '.join([label.label for label in labels])
        row['Label Count'] = labels.count()
        
        data.append(row)
    
    df = pd.DataFrame(data)
    
    # Konvertiere Datumsspalten in datetime
    df['Buchungsdatum'] = pd.to_datetime(df['Buchungsdatum'])
    df['Valutadatum'] = pd.to_datetime(df['Valutadatum'])
    
    return df


def generate_jahresabschluss():
    """Generiert den vollständigen Jahresabschluss 2025"""
    
    print("Lade Buchungen für 2025...")
    bookings = get_bookings_2025()
    print(f"Gefunden: {bookings.count()} Buchungen")
    
    # DataFrame erstellen
    df = create_dataframe(bookings)
    
    # Grundlegende Statistiken
    total_income = df[df['Betrag'] > 0]['Betrag'].sum()
    total_expenses = df[df['Betrag'] < 0]['Betrag'].sum()
    net_balance = total_income + total_expenses
    
    print(f"\n=== JAHRESABSCHLUSS 2025 ===")
    print(f"Einnahmen: {total_income:,.2f} EUR")
    print(f"Ausgaben: {total_expenses:,.2f} EUR")
    print(f"Saldo: {net_balance:,.2f} EUR")
    
    # 1. Alle Buchungen (Rohdaten)
    print("\n=== ALLE BUCHUNGEN ===")
    print(df[['Buchungsdatum', 'Partnername', 'Betrag', 'Buchungs-Details', 'Labels']].to_string())
    
    # 2. Nach Partner gruppiert
    print("\n=== NACH PARTNER GRUPPIERT ===")
    partner_summary = df.groupby('Partnername').agg({
        'Betrag': ['count', 'sum']
    }).round(2)
    partner_summary.columns = ['Anzahl', 'Summe']
    partner_summary = partner_summary.sort_values('Summe', ascending=False)
    print(partner_summary.to_string())
    
    # 3. Nach Monat
    print("\n=== NACH MONAT ===")
    df['Monat'] = df['Buchungsdatum'].dt.month
    df['Monatsname'] = df['Buchungsdatum'].dt.strftime('%B')
    monthly_summary = df.groupby('Monatsname').agg({
        'Betrag': ['count', 'sum']
    }).round(2)
    monthly_summary.columns = ['Anzahl', 'Summe']
    # Sort by month number
    month_order = ['Januar', 'Februar', 'März', 'April', 'Mai', 'Juni', 
                   'Juli', 'August', 'September', 'Oktober', 'November', 'Dezember']
    monthly_summary = monthly_summary.reindex([m for m in month_order if m in monthly_summary.index])
    print(monthly_summary.to_string())
    
    # 4. Nach Labels gruppiert
    print("\n=== NACH LABELS GRUPPIERT ===")
    # Split labels and explode
    labeled_df = df[df['Labels'] != ''].copy()
    if not labeled_df.empty:
        labeled_df['Label'] = labeled_df['Labels'].str.split(', ')
        exploded = labeled_df.explode('Label')
        label_summary = exploded.groupby('Label').agg({
            'Betrag': ['count', 'sum']
        }).round(2)
        label_summary.columns = ['Anzahl', 'Summe']
        label_summary = label_summary.sort_values('Summe', ascending=False)
        print(label_summary.to_string())
    
    # 5. Einnahmen und Ausgaben nach Kategorie
    print("\n=== EINNAHMEN (Top 10) ===")
    income_df = df[df['Betrag'] > 0].sort_values('Betrag', ascending=False)
    print(income_df[['Buchungsdatum', 'Partnername', 'Betrag', 'Buchungs-Details']].head(10).to_string())
    
    print("\n=== AUSGABEN (Top 10) ===")
    expenses_df = df[df['Betrag'] < 0].sort_values('Betrag', ascending=True)  # Most negative first
    print(expenses_df[['Buchungsdatum', 'Partnername', 'Betrag', 'Buchungs-Details']].head(10).to_string())
    
    return {
        'df': df,
        'total_income': total_income,
        'total_expenses': total_expenses,
        'net_balance': net_balance,
        'partner_summary': partner_summary,
        'monthly_summary': monthly_summary,
        'label_summary': label_summary if not labeled_df.empty else None,
        'income_df': income_df,
        'expenses_df': expenses_df
    }


def save_to_excel(results, filename):
    """Speichert die Ergebnisse in einer Excel-Datei"""
    
    with pd.ExcelWriter(filename, engine='openpyxl') as writer:
        # 1. Alle Buchungen
        results['df'].to_excel(writer, sheet_name='Alle Buchungen', index=False)
        
        # 2. Zusammenfassung
        summary_df = pd.DataFrame({
            'Kategorie': ['Einnahmen', 'Ausgaben', 'Saldo'],
            'Betrag': [results['total_income'], results['total_expenses'], results['net_balance']]
        })
        summary_df.to_excel(writer, sheet_name='Zusammenfassung', index=False)
        
        # 3. Nach Partner
        results['partner_summary'].to_excel(writer, sheet_name='Nach Partner', index=True)
        
        # 4. Nach Monat
        results['monthly_summary'].to_excel(writer, sheet_name='Nach Monat', index=True)
        
        # 5. Nach Labels (falls vorhanden)
        if results['label_summary'] is not None:
            results['label_summary'].to_excel(writer, sheet_name='Nach Labels', index=True)
        
        # 6. Einnahmen Detail
        results['income_df'].to_excel(writer, sheet_name='Einnahmen', index=False)
        
        # 7. Ausgaben Detail
        results['expenses_df'].to_excel(writer, sheet_name='Ausgaben', index=False)
    
    print(f"\nJahresabschluss wurde in '{filename}' gespeichert!")


if __name__ == '__main__':
    # Jahresabschluss generieren
    results = generate_jahresabschluss()
    
    # In Excel speichern
    output_dir = '/home/martin/Workspace/Energiegemeinschaft/notebooks/finance/Jahresabschluss/2025'
    os.makedirs(output_dir, exist_ok=True)
    output_file = os.path.join(output_dir, '2025-01-01_2025-12-31.xlsx')
    
    save_to_excel(results, output_file)
    
    print("\nFertig!")
