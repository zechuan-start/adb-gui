use std::collections::BTreeMap;

use serde::Serialize;

/// A locale-independent failure. Only external diagnostics belong in `detail`.
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
pub struct AppError {
    pub code: &'static str,
    #[serde(skip_serializing_if = "BTreeMap::is_empty")]
    pub params: BTreeMap<String, ErrorParam>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub detail: Option<String>,
    #[serde(skip_serializing_if = "Vec::is_empty")]
    pub causes: Vec<AppError>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(untagged)]
pub enum ErrorParam {
    Text(String),
    Number(serde_json::Number),
}

impl From<String> for ErrorParam {
    fn from(value: String) -> Self {
        Self::Text(value)
    }
}

impl From<&str> for ErrorParam {
    fn from(value: &str) -> Self {
        Self::Text(value.to_owned())
    }
}

macro_rules! numeric_param {
    ($($kind:ty),+ $(,)?) => { $(
        impl From<$kind> for ErrorParam {
            fn from(value: $kind) -> Self { Self::Number(value.into()) }
        }
    )+ };
}
numeric_param!(u8, u16, u32, u64, i8, i16, i32, i64);

impl From<usize> for ErrorParam {
    fn from(value: usize) -> Self {
        Self::Number((value as u64).into())
    }
}

impl AppError {
    pub fn new(code: &'static str) -> Self {
        Self {
            code,
            params: BTreeMap::new(),
            detail: None,
            causes: Vec::new(),
        }
    }

    pub fn param(mut self, key: &str, value: impl Into<ErrorParam>) -> Self {
        self.params.insert(key.to_owned(), value.into());
        self
    }

    pub fn detail(mut self, detail: impl Into<String>) -> Self {
        let detail = detail.into();
        if !detail.is_empty() {
            self.detail = Some(match self.detail.take() {
                Some(previous) => format!("{previous}\n{detail}"),
                None => detail,
            });
        }
        self
    }

    pub fn cause(mut self, cause: AppError) -> Self {
        self.causes.push(cause);
        self
    }

    pub fn causes(mut self, causes: Vec<AppError>) -> Self {
        self.causes = causes;
        self
    }
}

impl std::fmt::Display for AppError {
    fn fmt(&self, formatter: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        write!(formatter, "{}", self.code)?;
        if !self.params.is_empty() {
            write!(formatter, " {:?}", self.params)?;
        }
        if let Some(detail) = &self.detail {
            write!(formatter, ": {detail}")?;
        }
        for cause in &self.causes {
            write!(formatter, "; {cause}")?;
        }
        Ok(())
    }
}

impl std::error::Error for AppError {}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::error_codes as codes;

    #[test]
    fn every_native_error_code_has_a_frontend_schema_and_both_translations() {
        let schema = include_str!("../../src/i18n/backendErrorContract.ts");
        let zh = include_str!("../../src/i18n/messages/backend-zh-CN.ts");
        let en = include_str!("../../src/i18n/messages/backend-en.ts");
        for code in codes::ALL {
            let key = format!("\"{code}\":");
            assert!(schema.contains(&key), "missing frontend schema: {code}");
            assert!(zh.contains(&key), "missing Chinese error: {code}");
            assert!(en.contains(&key), "missing English error: {code}");
        }
    }

    #[test]
    fn serializes_parameters_and_nested_diagnostics_without_losing_types() {
        let error = AppError::new(codes::CAPTURE_SIZE_MISMATCH)
            .param("expected", 123_u64)
            .param("size", 122_u64)
            .param("path", "/sdcard/中文 file")
            .cause(
                AppError::new(codes::ADB_COMMAND_FAILED)
                    .param("status", "exit status: 1")
                    .detail("error: device offline"),
            );
        assert_eq!(
            serde_json::to_value(error).unwrap(),
            serde_json::json!({
                "code": codes::CAPTURE_SIZE_MISMATCH,
                "params": { "expected": 123, "size": 122, "path": "/sdcard/中文 file" },
                "causes": [{ "code": codes::ADB_COMMAND_FAILED, "params": { "status": "exit status: 1" }, "detail": "error: device offline" }]
            })
        );
        assert_eq!(
            serde_json::to_value(AppError::new(codes::RECORDING_BUSY)).unwrap(),
            serde_json::json!({ "code": codes::RECORDING_BUSY })
        );
    }
}
