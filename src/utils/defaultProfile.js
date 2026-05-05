export const defaultConfigProfile = {
  "name": "Built In",
  "playout_config": {
    "dvr_enabled": true,
    "dvr_max_duration": 14400,
    "ladder_specs": {
      "audio": [
        {
          "bit_rate": 192000,
          "channels": 2,
          "codecs": "mp4a.40.2"
        },
        {
          "bit_rate": 384000,
          "channels": 6,
          "codecs": "mp4a.40.2"
        }
      ],
      "video": [
        {
          "bit_rate": 9500000,
          "codecs": "avc1.64002A,mp4a.40.2",
          "height": 1080,
          "width": 1920,
          "level": 42,
          "profile": "high"
        },
        {
          "bit_rate": 4500000,
          "codecs": "avc1.640028,mp4a.40.2",
          "height": 720,
          "width": 1280,
          "level": 40,
          "profile": "high"
        },
        {
          "bit_rate": 2000000,
          "codecs": "avc1.640020,mp4a.40.2",
          "height": 540,
          "width": 960,
          "level": 32,
          "profile": "high"
        },
        {
          "bit_rate": 900000,
          "codecs": "avc1.64001F,mp4a.40.2",
          "height": 540,
          "width": 960,
          "level": 32,
          "profile": "high"
        }
      ]
    },
    "playout_formats": [
      "hls-clear",
      "dash-clear"
    ]
  },
  "recording_params": {
    "xc_params": {
      "preset": "faster",
      "profile": "high",
      "level": 42
    }
  },
  "recording_config": {
    "reconnect_timeout": 600,
    "connection_timeout": 600,
    "part_ttl": 86400
  }
};
