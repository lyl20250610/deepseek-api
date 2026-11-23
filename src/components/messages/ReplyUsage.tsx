import clsx from 'clsx'
import { memo, useState } from 'react'
import { useTranslate, type TranslationKey } from '../../i18n/index.js'
import type { ReasoningEffort } from '../../services/api/types.js'
import { useSettings } from '../../services/settings.js'
import type { AssistantMessage } from '../../services/chat/types.js'
import { IconChevronDownOutline14, IconDataOutline16 } from '../base/icons.js'
import styles from './ReplyUsage.module.css'

const effortLabelKeys: Record<ReasoningEffort, TranslationKey> = {
  low: 'effortLow',
  high: 'effortHigh',
  max: 'effortMax',
}

const DetailRow = ({ label, value }: { label: string; value: string }) => (
  <div className={styles.row}>
    <span>{label}</span>
    <span className={styles.value}>{value}</span>
  </div>
)

/**
 * 回复用量条：展示本轮请求实际使用的模型、思考强度、token 与缓存命中率。
 * 数据来自 message_start / message_delta 的 usage，点按展开明细。
 */
export const ReplyUsage = memo(function ReplyUsage({ message }: { message: AssistantMessage }) {
  const t = useTranslate()
  const locale = useSettings((state) => state.locale)
  const [expanded, setExpanded] = useState(false)
  const usage = message.usage
  if (!usage) {
    return null
  }

  const formatCount = (value: number) =>
    value.toLocaleString(locale === 'zh-CN' ? 'zh-CN' : 'en-US')
  const totalInput =
    usage.input_tokens + usage.cache_creation_input_tokens + usage.cache_read_input_tokens
  const cacheHit = totalInput > 0 ? (usage.cache_read_input_tokens / totalInput) * 100 : null
  const hitText = cacheHit === null ? '—' : `${cacheHit.toFixed(1)}%`
  const model = message.responseModel?.trim() || message.model || '—'
  const effort = message.thinking && message.effort ? t(effortLabelKeys[message.effort]) : null
  const details = usage.output_tokens_details
  const tools = usage.server_tool_use
  const searches = tools?.web_search_requests ?? 0
  const fetches = tools?.tool_fetch ?? tools?.web_fetch_requests ?? 0

  return (
    <div className={styles.wrapper}>
      <button
        type="button"
        className={styles.summary}
        aria-label={t('usageDetails')}
        aria-expanded={expanded}
        onClick={() => setExpanded((value) => !value)}
      >
        <IconDataOutline16 />
        <span className={styles.model}>{model}</span>
        {effort ? (
          <>
            <span className={styles.separator}>·</span>
            <span>{t('usageEffort', { effort })}</span>
          </>
        ) : null}
        <span className={styles.separator}>·</span>
        <span>{t('usageInputShort', { count: formatCount(usage.input_tokens) })}</span>
        <span className={styles.separator}>·</span>
        <span className={styles.highlight}>
          {t('usageCacheHitShort', { percent: hitText })}
        </span>
        <span className={styles.separator}>·</span>
        <span>{t('usageOutputShort', { count: formatCount(usage.output_tokens) })}</span>
        <span className={clsx(styles.chevron, expanded && styles.chevronOpen)}>
          <IconChevronDownOutline14 />
        </span>
      </button>
      {expanded ? (
        <div className={styles.details}>
          <div className={styles.hitRow}>
            <span>{t('usageCacheHit')}</span>
            <span className={styles.bar}>
              <span
                className={styles.barFill}
                style={{ width: `${Math.min(100, Math.max(0, cacheHit ?? 0))}%` }}
              />
            </span>
            <span className={styles.value}>{hitText}</span>
          </div>
          <DetailRow label={t('usageInputUncached')} value={formatCount(usage.input_tokens)} />
          <DetailRow
            label={t('usageCacheWrite')}
            value={formatCount(usage.cache_creation_input_tokens)}
          />
          <DetailRow
            label={t('usageCacheRead')}
            value={formatCount(usage.cache_read_input_tokens)}
          />
          <DetailRow label={t('usageOutput')} value={formatCount(usage.output_tokens)} />
          {details?.thinking_tokens !== undefined ? (
            <DetailRow
              label={t('usageThinkingTokens')}
              value={formatCount(details.thinking_tokens)}
            />
          ) : null}
          {details?.safety_tokens !== undefined ? (
            <DetailRow
              label={t('usageSafetyTokens')}
              value={formatCount(details.safety_tokens)}
            />
          ) : null}
          {searches > 0 ? (
            <DetailRow label={t('usageSearches')} value={t('usageTimes', { count: searches })} />
          ) : null}
          {fetches > 0 ? (
            <DetailRow label={t('usageFetches')} value={t('usageTimes', { count: fetches })} />
          ) : null}
        </div>
      ) : null}
    </div>
  )
})
