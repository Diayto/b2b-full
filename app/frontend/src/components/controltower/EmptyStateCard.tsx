import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { cn } from '@/lib/utils';

export interface EmptyStateCardProps {
  title: string;
  description: string;
  ctaLabel?: string;
  onCta?: () => void;
  secondaryCtaLabel?: string;
  onSecondaryCta?: () => void;
  imageUrl?: string;
  className?: string;
}

export default function EmptyStateCard(props: EmptyStateCardProps) {
  const {
    title,
    description,
    ctaLabel,
    onCta,
    secondaryCtaLabel,
    onSecondaryCta,
    imageUrl,
    className,
  } = props;

  const hasActions = (ctaLabel && onCta) || (secondaryCtaLabel && onSecondaryCta);

  return (
    <Card className={cn('rct-card', className)}>
      <CardHeader className="text-center">
        <CardTitle className="rct-section-title">{title}</CardTitle>
        <CardDescription className="rct-body-micro mt-1">{description}</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col items-center justify-center py-10 text-center">
        {imageUrl ? (
          <img src={imageUrl} alt="" className="h-32 w-32 mx-auto mb-6 opacity-80 object-contain" />
        ) : null}
        <p className="rct-body-micro mb-6 max-w-md mx-auto">{description}</p>
        {hasActions ? (
          <div className="flex flex-wrap items-center justify-center gap-3">
            {ctaLabel && onCta ? (
              <Button onClick={onCta} className="rct-btn-primary">
                {ctaLabel}
              </Button>
            ) : null}
            {secondaryCtaLabel && onSecondaryCta ? (
              <Button variant="outline" onClick={onSecondaryCta}>
                {secondaryCtaLabel}
              </Button>
            ) : null}
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}
