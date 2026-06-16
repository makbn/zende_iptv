/** Xtream Codes API content buckets — mirrors IPTVnator `CategoryType` / `StreamType`. */
export type XtreamCategoryType = "live" | "vod" | "series";

export type XtreamStreamType = "live" | "movie" | "series";

export type XtreamCredentials = {
  serverUrl: string;
  username: string;
  password: string;
  /** Preferred live output (ts, m3u8, …). */
  liveFormat?: string;
};

export type XtreamCategory = {
  category_id: string;
  category_name: string;
  parent_id?: string;
};

export type XtreamLiveStream = {
  num?: number;
  name: string;
  stream_type: "live";
  stream_id: number | string;
  stream_icon?: string;
  epg_channel_id?: string;
  category_id?: string | number;
};

export type XtreamVodStream = {
  num?: number;
  name: string;
  stream_type: "movie";
  stream_id: number | string;
  stream_icon?: string;
  category_id?: string | number;
  container_extension?: string;
};

export type XtreamSeriesItem = {
  num?: number;
  name: string;
  series_id: number | string;
  cover?: string;
  category_id?: string | number;
};

export type XtreamSeriesEpisode = {
  id: number | string;
  title?: string;
  container_extension: string;
  episode_num?: number | string;
  season?: number | string;
  info?: Record<string, unknown>;
  duration?: number | string;
};

export type XtreamSeriesInfo = {
  info?: Record<string, unknown>;
  seasons?: Array<{ season_number?: number | string; name?: string }>;
  episodes?: Record<string, XtreamSeriesEpisode[]>;
};

export type XtreamVodInfo = {
  info?: Record<string, unknown>;
  movie_data?: {
    stream_id?: number | string;
    container_extension?: string;
    name?: string;
  };
};
