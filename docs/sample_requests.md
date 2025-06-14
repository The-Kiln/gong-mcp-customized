GET /v2/calls/{id}
curl -X GET "https://api.gong.io/v2/calls/1234567890" \
  -H "Authorization: Basic <base64_encoded_access_key:secret>"


POST /v2/calls/extensive
curl -X POST "https://api.gong.io/v2/calls/extensive" \
  -H "Authorization: Basic <base64_encoded_access_key:secret>" \
  -H "Content-Type: application/json" \
  -d '{
        "filter": {
          "fromDateTime": "2025-04-01T00:00:00Z",
          "toDateTime": "2025-04-30T23:59:59Z"
        },
        "contentSelector": {
          "context": "Extended",
          "contextTiming": ["Now", "TimeOfCall"],
          "exposedFields": {
            "interaction": { "questions": true, "speakers": true },
            "content":     { "topics": true, "trackers": true },
            "media": true
          }
        }
      }'

# With pagination
POST /v2/calls/extensive
{
  "paginate": true,
  "requestBody": {
    "filter": {
      "fromDateTime": "2025-04-01T00:00:00Z",
      "toDateTime": "2025-04-30T23:59:59Z"
    },
    "contentSelector": {
      "context": "Extended",
      "contextTiming": ["Now", "TimeOfCall"],
      "exposedFields": {
        "interaction": { "questions": true, "speakers": true },
        "content":     { "topics": true, "trackers": true },
        "media": true
      }
    }
  }
}


POST /v2/calls/transcript
curl -X POST "https://api.gong.io/v2/calls/transcript" \
  -H "Authorization: Basic <base64_encoded_access_key:secret>" \
  -H "Content-Type: application/json" \
  -d '{
        "filter": {
          "callIds": ["1234567890"]
        }
      }'

# With pagination
POST /v2/calls/transcript
{
  "paginate": true,
  "requestBody": {
    "filter": {
      "callIds": ["1234567890"]
    }
  }
}


GET /v2/users
curl -X GET "https://api.gong.io/v2/users" \
  -H "Authorization: Basic <base64_encoded_access_key:secret>"

# With pagination
GET /v2/users
{
  "paginate": true
}


GET /v2/data-privacy/data-for-email-address
curl -X GET "https://api.gong.io/v2/data-privacy/data-for-email-address?emailAddress=example@example.com" \
  -H "Authorization: Basic <base64_encoded_access_key:secret>"

# With pagination
GET /v2/data-privacy/data-for-email-address
{
  "paginate": true,
  "emailAddress": "example@example.com"
}