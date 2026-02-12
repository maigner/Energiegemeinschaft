use base64::{Engine as _, engine::general_purpose};
use reqwest;
use serde_json::Value;

pub async fn api_call() -> Result<Value, reqwest::Error> {
    let username = "martin@maigner.net";
    let password = "****";
    let credentials = format!("{}:{}", username, password);
    let encoded_credentials = general_purpose::STANDARD.encode(credentials.as_bytes());
    let ecid = "RC101533";

    //let url = "https://eegfaktura.at/api/participant";

    let url = "https://eegfaktura.at/energystore/query/RC101533/metadata";

    let client = reqwest::Client::new();
    let response = client
        .get(url)
        .header("Authorization", format!("Basic {}", encoded_credentials))
        .header("X-Tenant", ecid)
        .send()
        .await?;

    let status = response.status();

    if !status.is_success() {
        panic!("{:?}", status.as_str());
    }

    let result = response.json::<Value>().await?;

    //let response = reqwest::get(url).await?.json::<Value>().await?;

    Ok(result)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[tokio::test]
    async fn test_api_call() {
        let r = api_call().await;
        println!("{:?}", r.unwrap());
    }
}
