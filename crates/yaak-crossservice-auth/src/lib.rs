//! [shaman] CORE-454: the cross-service token authentication type.
//!
//! Shaman services authenticate each other with a short-lived HS256 JWT bound to the exact
//! request body, sent as `Authorization: API-KEY JWT=<jwt>,CompanyUrlName=<company>`. This
//! crate mints that header from an auth form's values and the body bytes about to be sent.
//! It is pure: no I/O, no clock, so every host (desktop, CLI, browser send server) calls it
//! from wherever it has the final body, and the tests pin the exact bytes.
//!
//! The token contract, as go-core verifies it (`pkg/crossservicetoken`): header
//! `{alg: HS256, typ: JWT, kid}`; claims `sub`, `aud` (array), `iat`, `exp`, `jti`, `bh`
//! (`"sha256:" + lowercase hex of the raw body`), `company`, optional `act: {sub}`.

use base64::Engine;
use base64::engine::general_purpose::{STANDARD, URL_SAFE_NO_PAD};
use hmac::{Hmac, Mac};
use serde::Serialize;
use serde_json::Value;
use sha2::{Digest, Sha256};
use std::collections::BTreeMap;

/// The `authentication_type` stored on requests, folders and workspaces.
pub const AUTH_NAME: &str = "shaman_crossservice";
pub const LABEL: &str = "Cross-service token (Shaman)";
pub const SHORT_LABEL: &str = "Cross-service";

/// The config form, in the plugin API's `FormInput` JSON shape. One file, read by the Rust
/// registry and imported by the browser host's TypeScript, so the two never drift.
pub const FORM_JSON: &str = include_str!("../form.json");

const DEFAULT_AUDIENCE: &str = "go-core";
const DEFAULT_SUBJECT: &str = "yaak";
const DEFAULT_TTL_SECONDS: u64 = 90;

#[derive(Debug, thiserror::Error)]
pub enum Error {
    #[error("Cross-service token: {0}")]
    Config(String),
}

/// The auth form's values, checked and decoded.
#[derive(Debug, Clone)]
pub struct Config {
    pub audience: String,
    pub company: String,
    pub kid: String,
    pub secret: Vec<u8>,
    pub subject: String,
    pub ttl_seconds: u64,
    pub act_sub: Option<String>,
}

impl Config {
    /// Read the rendered form values (templates already resolved, `secure()` decrypted).
    pub fn from_values(values: &BTreeMap<String, Value>) -> Result<Config, Error> {
        let company = text(values, "company");
        if company.is_empty() {
            return Err(Error::Config("the company URL name is empty".into()));
        }
        let kid = text(values, "kid");
        if kid.is_empty() {
            return Err(Error::Config("the key id is empty".into()));
        }
        let raw_secret = text(values, "secret");
        if raw_secret.is_empty() {
            return Err(Error::Config("the secret is empty".into()));
        }
        let secret = if flag(values, "secretBase64", true) {
            STANDARD.decode(raw_secret.as_bytes()).map_err(|_| {
                Error::Config(
                    "the secret is not valid base64; untick \"Secret is base64\" for a plain-text secret"
                        .into(),
                )
            })?
        } else {
            raw_secret.into_bytes()
        };

        let ttl = text(values, "ttl");
        let ttl_seconds = if ttl.is_empty() {
            DEFAULT_TTL_SECONDS
        } else {
            ttl.parse::<u64>().ok().filter(|t| *t > 0).ok_or_else(|| {
                Error::Config(format!("the lifetime \"{ttl}\" is not a number of seconds"))
            })?
        };

        let act_sub = text(values, "actSub");
        let act_sub = if act_sub.is_empty() {
            None
        } else if act_sub.bytes().all(|b| b.is_ascii_digit()) {
            Some(act_sub)
        } else {
            return Err(Error::Config(format!(
                "the user id to act as, \"{act_sub}\", is not numeric"
            )));
        };

        let audience = text(values, "audience");
        let subject = text(values, "subject");
        Ok(Config {
            audience: if audience.is_empty() { DEFAULT_AUDIENCE.into() } else { audience },
            company,
            kid,
            secret,
            subject: if subject.is_empty() { DEFAULT_SUBJECT.into() } else { subject },
            ttl_seconds,
            act_sub,
        })
    }
}

/// The auth editor's Enabled/Disabled control writes `disabled` into the same values.
pub fn is_disabled(values: &BTreeMap<String, Value>) -> bool {
    match values.get("disabled") {
        Some(Value::Bool(b)) => *b,
        Some(Value::String(s)) => s.trim() == "true",
        _ => false,
    }
}

/// The `bh` claim: the exact bytes on the wire, nothing canonicalized.
pub fn body_hash(body: &[u8]) -> String {
    format!("sha256:{}", hex::encode(Sha256::digest(body)))
}

/// The full `Authorization` header value for a request whose body is `body`, minted now.
/// Not built for wasm32: the browser hands the send to the server, which mints it there.
#[cfg(not(target_arch = "wasm32"))]
pub fn authorization_header(config: &Config, body: &[u8], now_unix: i64) -> String {
    let jti = uuid::Uuid::new_v4().to_string();
    let jwt = sign(config, body, now_unix, &jti);
    format!("API-KEY JWT={jwt},CompanyUrlName={}", config.company)
}

// Field order is the wire order: serde writes struct fields as declared, so the tests can
// pin the exact token. Verifiers do not care about the order.
#[derive(Serialize)]
struct Header<'a> {
    alg: &'static str,
    typ: &'static str,
    kid: &'a str,
}

#[derive(Serialize)]
struct Act<'a> {
    sub: &'a str,
}

#[derive(Serialize)]
struct Claims<'a> {
    sub: &'a str,
    aud: [&'a str; 1],
    iat: i64,
    exp: i64,
    jti: &'a str,
    bh: String,
    company: &'a str,
    #[serde(skip_serializing_if = "Option::is_none")]
    act: Option<Act<'a>>,
}

/// The compact JWT. Deterministic given `now_unix` and `jti`.
pub fn sign(config: &Config, body: &[u8], now_unix: i64, jti: &str) -> String {
    let header = Header { alg: "HS256", typ: "JWT", kid: &config.kid };
    let claims = Claims {
        sub: &config.subject,
        aud: [&config.audience],
        iat: now_unix,
        exp: now_unix + config.ttl_seconds as i64,
        jti,
        bh: body_hash(body),
        company: &config.company,
        act: config.act_sub.as_deref().map(|sub| Act { sub }),
    };
    // Serializing these structs cannot fail: no maps, no floats, no non-string keys.
    let header_json = serde_json::to_vec(&header).expect("header serializes");
    let claims_json = serde_json::to_vec(&claims).expect("claims serialize");
    let signing_input =
        format!("{}.{}", URL_SAFE_NO_PAD.encode(header_json), URL_SAFE_NO_PAD.encode(claims_json));
    let mut mac =
        Hmac::<Sha256>::new_from_slice(&config.secret).expect("HMAC accepts any key length");
    mac.update(signing_input.as_bytes());
    let signature = URL_SAFE_NO_PAD.encode(mac.finalize().into_bytes());
    format!("{signing_input}.{signature}")
}

fn text(values: &BTreeMap<String, Value>, name: &str) -> String {
    match values.get(name) {
        Some(Value::String(s)) => s.trim().to_string(),
        Some(Value::Number(n)) => n.to_string(),
        Some(Value::Bool(b)) => b.to_string(),
        _ => String::new(),
    }
}

fn flag(values: &BTreeMap<String, Value>, name: &str, default: bool) -> bool {
    match values.get(name) {
        Some(Value::Bool(b)) => *b,
        Some(Value::String(s)) => match s.trim() {
            "true" => true,
            "false" => false,
            _ => default,
        },
        _ => default,
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    const BODY: &[u8] = br#"{"query":"{ __typename }"}"#;
    const NOW: i64 = 1_700_000_000;
    const JTI: &str = "00000000-0000-4000-8000-000000000000";
    // Computed independently with Node's crypto module using the plugin's algorithm.
    const EXPECTED_JWT: &str = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCIsImtpZCI6ImdvLWNvcmUtMSJ9.eyJzdWIiOiJ5YWFrLWNhbGxlciIsImF1ZCI6WyJnby1jb3JlIl0sImlhdCI6MTcwMDAwMDAwMCwiZXhwIjoxNzAwMDAwMDkwLCJqdGkiOiIwMDAwMDAwMC0wMDAwLTQwMDAtODAwMC0wMDAwMDAwMDAwMDAiLCJiaCI6InNoYTI1Njo5MTA3NmE5NjE2YWMwY2Q5ZWQ5ZWQ3ZWQyOGJhZmU3MjBmNDdjMGNkODQwNmU2OGI0NWI2ZGRiYTFmZThiODk3IiwiY29tcGFueSI6ImRlbW8iLCJhY3QiOnsic3ViIjoiNDIifX0.5xXiGaFMzzeHExTO1wFNc95Yko4acbGUsCtNKs8bQkw";

    fn values(secret: &str, base64: bool) -> BTreeMap<String, Value> {
        let v = json!({
            "company": "demo",
            "kid": "go-core-1",
            "secret": secret,
            "secretBase64": base64,
            "audience": "go-core",
            "ttl": "90",
            "subject": "yaak-caller",
            "actSub": "42",
        });
        serde_json::from_value(v).unwrap()
    }

    #[test]
    fn matches_the_known_vector() {
        let config = Config::from_values(&values("dGVzdC1zZWNyZXQ=", true)).unwrap();
        assert_eq!(sign(&config, BODY, NOW, JTI), EXPECTED_JWT);
        assert_eq!(
            body_hash(BODY),
            "sha256:91076a9616ac0cd9ed9ed7ed28bafe720f47c0cd8406e68b45b6ddba1fe8b897"
        );
    }

    #[test]
    fn plain_secret_signs_the_same_as_its_base64_form() {
        let config = Config::from_values(&values("test-secret", false)).unwrap();
        assert_eq!(sign(&config, BODY, NOW, JTI), EXPECTED_JWT);
    }

    #[test]
    fn header_has_the_api_key_shape() {
        let config = Config::from_values(&values("test-secret", false)).unwrap();
        let header = authorization_header(&config, b"", NOW);
        assert!(header.starts_with("API-KEY JWT=eyJ"));
        assert!(header.ends_with(",CompanyUrlName=demo"));
        let jwt = &header["API-KEY JWT=".len()..header.len() - ",CompanyUrlName=demo".len()];
        assert_eq!(jwt.split('.').count(), 3);
    }

    #[test]
    fn act_is_omitted_and_defaults_apply_when_optional_fields_are_empty() {
        let mut v = values("test-secret", false);
        for name in ["actSub", "audience", "ttl", "subject"] {
            v.insert(name.into(), Value::String("".into()));
        }
        let config = Config::from_values(&v).unwrap();
        assert_eq!(config.audience, "go-core");
        assert_eq!(config.subject, "yaak");
        assert_eq!(config.ttl_seconds, 90);
        let jwt = sign(&config, b"", NOW, JTI);
        let payload = jwt.split('.').nth(1).unwrap();
        let payload = URL_SAFE_NO_PAD.decode(payload).unwrap();
        let payload: Value = serde_json::from_slice(&payload).unwrap();
        assert!(payload.get("act").is_none());
        assert_eq!(payload["exp"].as_i64(), Some(NOW + 90));
        assert_eq!(payload["bh"], body_hash(b""));
    }

    #[test]
    fn rejects_missing_or_malformed_values() {
        let mut v = values("test-secret", false);
        v.insert("company".into(), Value::String(" ".into()));
        assert!(Config::from_values(&v).unwrap_err().to_string().contains("company"));

        let mut v = values("not base64!", true);
        assert!(Config::from_values(&v).unwrap_err().to_string().contains("base64"));
        v.insert("secretBase64".into(), Value::String("false".into()));
        assert!(Config::from_values(&v).is_ok());

        let mut v = values("test-secret", false);
        v.insert("actSub".into(), Value::String("bob".into()));
        assert!(Config::from_values(&v).unwrap_err().to_string().contains("numeric"));

        let mut v = values("test-secret", false);
        v.insert("ttl".into(), Value::String("soon".into()));
        assert!(Config::from_values(&v).unwrap_err().to_string().contains("lifetime"));
    }

    #[test]
    fn disabled_flag_reads_bool_or_string() {
        let mut v = BTreeMap::new();
        assert!(!is_disabled(&v));
        v.insert("disabled".to_string(), Value::Bool(true));
        assert!(is_disabled(&v));
        v.insert("disabled".to_string(), Value::String("false".into()));
        assert!(!is_disabled(&v));
    }

    #[test]
    fn the_form_parses_and_names_every_field_the_config_reads() {
        let form: Vec<Value> = serde_json::from_str(FORM_JSON).unwrap();
        let names: Vec<&str> = form.iter().map(|f| f["name"].as_str().unwrap()).collect();
        for expected in [
            "company",
            "kid",
            "secret",
            "secretBase64",
            "audience",
            "ttl",
            "actSub",
            "subject",
        ] {
            assert!(names.contains(&expected), "{expected} missing from form.json");
        }
        assert_eq!(form[2]["password"], json!(true));
    }
}
