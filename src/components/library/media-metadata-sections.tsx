import { Avatar, AvatarFallback, AvatarImage } from "@appica/ui-react/avatar";
import { Badge } from "@appica/ui-react/badge";
import { Button } from "@appica/ui-react/button";
import { Card, CardDescription, CardHeader, CardTitle } from "@appica/ui-react/card";
import { ExternalLink, Star } from "lucide-react";

import type { MediaMetadata } from "@/lib/media/media-metadata";
import { secureImageUrl } from "@/lib/media/secure-image-url";

function compactVotes(value: number): string {
  return new Intl.NumberFormat("en", { notation: "compact", maximumFractionDigits: 1 }).format(value);
}

function initials(name: string): string {
  return name
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("");
}

export function MediaMetadataFacts({ metadata }: { metadata: MediaMetadata }) {
  const facts = [
    metadata.year,
    metadata.contentRating,
    metadata.runtimeMinutes ? `${metadata.runtimeMinutes} min` : null,
    metadata.numberOfSeasons ? `${metadata.numberOfSeasons} seasons` : null,
    metadata.status,
  ].filter((value): value is string => Boolean(value));

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        {facts.map((fact) => (
          <Badge key={fact} variant="soft" size="sm">
            {fact}
          </Badge>
        ))}
        {metadata.genres.map((genre) => (
          <Badge key={genre} variant="outline" size="sm">
            {genre}
          </Badge>
        ))}
      </div>

      {metadata.scores.length > 0 || metadata.imdbId ? (
        <div className="flex flex-wrap gap-2">
          {metadata.scores.map((score) => (
            <Card
              key={score.source}
              frame="glass"
              className="min-w-[8.5rem] border-border bg-background/75"
            >
              <CardHeader className="flex-row items-center gap-2 p-3">
                <span className="flex size-9 items-center justify-center rounded-full bg-primary/12 text-primary-strong">
                  <Star className="size-4 fill-current" aria-hidden />
                </span>
                <div>
                  <CardDescription className="text-[10px] font-semibold uppercase tracking-[0.14em]">
                    {score.source}
                  </CardDescription>
                  <CardTitle className="mt-0.5 text-lg">
                    {score.value.toFixed(1)}
                    <span className="text-xs font-medium text-foreground-muted">/{score.max}</span>
                  </CardTitle>
                  {score.votes ? (
                    <p className="text-[10px] text-foreground-muted">{compactVotes(score.votes)} ratings</p>
                  ) : null}
                </div>
              </CardHeader>
            </Card>
          ))}
          {metadata.imdbId ? (
            <Button
              data-tv-external-link
              variant="secondary"
              render={
                <a
                  href={`https://www.imdb.com/title/${encodeURIComponent(metadata.imdbId)}/`}
                  target="_blank"
                  rel="noreferrer"
                />
              }
              className="h-auto min-h-[4.75rem] rounded-lg px-4"
            >
              IMDb
              <ExternalLink className="size-4" aria-hidden />
            </Button>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

export function MediaCastRail({ metadata }: { metadata: MediaMetadata }) {
  if (metadata.cast.length === 0) return null;

  return (
    <section aria-labelledby="cast-heading" className="pt-8">
      <div className="mb-4 flex items-end justify-between gap-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-primary-strong">
            People
          </p>
          <h2 id="cast-heading" className="mt-1 text-2xl font-semibold tracking-tight text-foreground-intense">
            Cast
          </h2>
        </div>
        <p className="text-xs text-foreground-muted">{metadata.cast.length} featured</p>
      </div>
      <div className="flex snap-x gap-3 overflow-x-auto pb-3 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {metadata.cast.map((person, index) => (
          <Card
            key={`${person.id ?? person.name}-${index}`}
            frame="solid"
            className="w-[8.5rem] shrink-0 snap-start border-border bg-background-muted"
          >
            <div className="flex flex-col items-center px-3 py-4 text-center">
              <Avatar size={72} className="ring-2 ring-border">
                {person.profileUrl ? (
                  <AvatarImage src={secureImageUrl(person.profileUrl)} alt="" />
                ) : null}
                <AvatarFallback>{initials(person.name) || "?"}</AvatarFallback>
              </Avatar>
              <p className="mt-3 line-clamp-2 text-sm font-semibold leading-tight text-foreground-intense">
                {person.name}
              </p>
              {person.character ? (
                <p className="mt-1 line-clamp-2 text-xs leading-tight text-foreground-muted">
                  {person.character}
                </p>
              ) : null}
            </div>
          </Card>
        ))}
      </div>
    </section>
  );
}
