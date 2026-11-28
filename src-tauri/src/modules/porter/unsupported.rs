use super::{PortEntry, StopStatus};

pub fn scan(_include_outgoing: bool) -> Result<Vec<PortEntry>, String> {
    Err("unsupported_platform".into())
}

pub fn terminate(_pid: u32, _elevate: bool) -> Result<StopStatus, String> {
    Ok(StopStatus::Unsupported)
}

pub fn open_credit() -> Result<(), String> {
    Err("unsupported_platform".into())
}
