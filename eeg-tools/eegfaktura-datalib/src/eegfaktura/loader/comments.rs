use std::collections::HashMap;
use std::fs::File;
use std::io::Read;

use quick_xml::events::Event;
use quick_xml::reader::Reader;

/// Reads every Excel cell comment ("note") in the workbook, keyed by cell
/// reference (e.g. `"H13"`). calamine has no API for this, so the xlsx (a
/// zip of XML parts) is read directly, independently of calamine's own
/// parsing of the same file.
///
/// A cell's comment text is the concatenation of every text run inside it,
/// in document order; newlines embedded in the source (e.g. between a bold
/// summary line and the day list that follows it) are preserved as-is.
///
/// Never fails: any I/O or XML problem just yields an empty map, since the
/// comments are a nice-to-have (affected-day detail) on top of the L0/L2/L3
/// counts, which come from the cell values themselves.
pub(crate) fn read_comments(path: &str) -> HashMap<String, String> {
    let mut result = HashMap::new();

    let Ok(file) = File::open(path) else {
        return result;
    };
    let Ok(mut archive) = zip::ZipArchive::new(file) else {
        return result;
    };

    // A workbook has at most a handful of comment parts (one per sheet that
    // has any comments) named `xl/comments<N>.xml`.
    let comment_parts: Vec<String> = archive
        .file_names()
        .filter(|name| {
            name.starts_with("xl/comments") && name.ends_with(".xml")
        })
        .map(String::from)
        .collect();

    for part in comment_parts {
        let Ok(mut entry) = archive.by_name(&part) else {
            continue;
        };
        let mut xml = String::new();
        if entry.read_to_string(&mut xml).is_err() {
            continue;
        }
        parse_comments_xml(&xml, &mut result);
    }

    result
}

fn parse_comments_xml(xml: &str, result: &mut HashMap<String, String>) {
    let mut reader = Reader::from_str(xml);
    reader.config_mut().trim_text(false);

    let mut current_ref: Option<String> = None;
    let mut current_text = String::new();
    let mut in_text_run = false;

    loop {
        match reader.read_event() {
            Ok(Event::Start(e)) if e.local_name().as_ref() == "comment" => {
                current_ref = e
                    .attributes()
                    .flatten()
                    .find(|a| a.key.local_name().as_ref() == "ref")
                    .and_then(|a| a.normalized_value(quick_xml::XmlVersion::Implicit1_0).ok())
                    .map(|v| v.into_owned());
                current_text.clear();
            }
            Ok(Event::Start(e)) if e.local_name().as_ref() == "t" => {
                in_text_run = true;
            }
            Ok(Event::End(e)) if e.local_name().as_ref() == "t" => {
                in_text_run = false;
            }
            Ok(Event::Text(t)) if in_text_run => {
                if let Ok(text) = quick_xml::escape::unescape(t.as_ref()) {
                    current_text.push_str(&text);
                }
            }
            Ok(Event::End(e)) if e.local_name().as_ref() == "comment" => {
                if let Some(cell_ref) = current_ref.take() {
                    result.insert(cell_ref, current_text.clone());
                }
                current_text.clear();
            }
            Ok(Event::Eof) => break,
            Err(_) => break,
            _ => {}
        }
    }
}

/// Parses the list of affected days out of a comment's raw text. The comment
/// is one or more lines; the day list is the last non-empty line, a
/// comma-separated list of `dd.mm.yyyy` dates (e.g. what `"L2 (Ersatzwert):
/// 2688 Viertelstunden an 28 Tagen\n01.07.2026, 02.07.2026, ..."` carries
/// after the summary line).
pub(crate) fn parse_affected_days(text: &str) -> Vec<chrono::NaiveDate> {
    let Some(last_line) = text.lines().map(str::trim).filter(|l| !l.is_empty()).last() else {
        return Vec::new();
    };
    last_line
        .split(',')
        .filter_map(|d| chrono::NaiveDate::parse_from_str(d.trim(), "%d.%m.%Y").ok())
        .collect()
}
