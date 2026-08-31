import { cn } from '../../lib/utils'

/**
 * The one horizontal rhythm for page-level content.
 *
 * `container mx-auto px-4 sm:px-6 lg:px-8` was copy-pasted at four sites. That
 * is not a lot of duplication in bytes, but it is four places that have to be
 * edited in step every time the gutter changes, and they had already drifted:
 * the padding matched, the vertical rhythm did not.
 *
 * Use this for anything that sits directly under `<main>`. Do not use it for
 * content already inside a Card — it would double the gutter.
 *
 * @param {'default'|'wide'|'full'} width  `wide` opts out of the container's
 *   max-width for genuinely wide content (a bracket, a full-league matrix);
 *   `full` drops the gutter too, for edge-to-edge scrollers on a phone.
 */
export function PageContainer({ as: Comp = 'div', width = 'default', className, children, ...props }) {
  return (
    <Comp
      className={cn(
        width !== 'full' && 'px-4 sm:px-6 lg:px-8',
        width === 'default' && 'container mx-auto',
        width === 'wide' && 'mx-auto w-full',
        className
      )}
      {...props}
    >
      {children}
    </Comp>
  )
}

export default PageContainer
