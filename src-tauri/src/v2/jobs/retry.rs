pub fn backoff_seconds(attempts: i64) -> i64 {
    let exp = attempts.clamp(1, 6) as u32;
    let value = 2_i64.pow(exp);
    value.clamp(2, 64)
}
