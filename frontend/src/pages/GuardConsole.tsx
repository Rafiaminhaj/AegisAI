import React, { useMemo, useState, useEffect } from 'react'
import {
  Activity,
  AlertCircle,
  Brain,
  Gauge,
  ListChecks,
  Loader2,
  Send,
  ShieldCheck,
  History,
  Settings,
  Plus,
  Trash2,
  Maximize2,
  X,
  Sliders,
  Filter,
  Download,
} from 'lucide-react'
import CopyButton from '../components/CopyButton'
import GuardExplanation from '../components/GuardExplanation'
import toast from 'react-hot-toast'
import {
  guardApi,
  guardHistoryApi,
  type GuardExplainResponse,
  type GuardScanResponse,
  type GuardScanLog,
  type CustomRegexRule,
  type UserGuardConfig,
} from '../services/api'

type GuardMetrics = {
  decision: string
  confidence: number
  matchedPatternCount: number
  matchedPatterns: string[]
  hasSanitizedPrompt: boolean
  scannedAt: string
}

function formatJson(value: unknown): string {
  return JSON.stringify(value, null, 2)
}

function buildMetrics(result: GuardScanResponse | null, scannedAt: string): GuardMetrics | null {
  if (!result) {
    return null
  }

  const matchedPatterns = result.matched_patterns ?? []

  return {
    decision: result.decision,
    confidence: result.confidence,
    matchedPatternCount: matchedPatterns.length,
    matchedPatterns,
    hasSanitizedPrompt: Boolean(result.sanitized_prompt),
    scannedAt,
  }
}

function decisionBadgeClass(decision: string): string {
  switch (decision) {
    case 'allow':
      return 'bg-emerald-100 text-emerald-700 border-emerald-200 dark:bg-emerald-900/30 dark:text-emerald-400 dark:border-emerald-800'
    case 'sanitize':
      return 'bg-amber-100 text-amber-700 border-amber-200 dark:bg-amber-900/30 dark:text-amber-400 dark:border-amber-800'
    case 'block':
      return 'bg-red-100 text-red-700 border-red-200 dark:bg-red-900/30 dark:text-red-400 dark:border-red-800'
    default:
      return 'bg-gray-100 text-gray-700 border-gray-200 dark:bg-gray-800 dark:text-gray-300 dark:border-gray-700'
  }
}

export default function GuardConsole() {
  const [activeTab, setActiveTab] = useState<'scan' | 'history' | 'config'>('scan')

  // Live Scan State
  const [prompt, setPrompt] = useState('')
  const [submittedPrompt, setSubmittedPrompt] = useState('')
  const [result, setResult] = useState<GuardScanResponse | null>(null)
  const [explanation, setExplanation] = useState<GuardExplainResponse | null>(null)
  const [explanationError, setExplanationError] = useState<string | null>(null)
  const [isExplaining, setIsExplaining] = useState(false)
  const [scannedAt, setScannedAt] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // History State
  const [logs, setLogs] = useState<GuardScanLog[]>([])
  const [nextCursor, setNextCursor] = useState<string | null>(null)
  const [isLoadingLogs, setIsLoadingLogs] = useState(false)
  const [logDecisionFilter, setLogDecisionFilter] = useState<string>('')
  const [logIntentFilter, setLogIntentFilter] = useState<string>('')
  const [selectedLog, setSelectedLog] = useState<GuardScanLog | null>(null)

  // Config State
  const [config, setConfig] = useState<UserGuardConfig | null>(null)
  const [isLoadingConfig, setIsLoadingConfig] = useState(false)
  const [isSavingConfig, setIsSavingConfig] = useState(false)
  const [newRuleName, setNewRuleName] = useState('')
  const [newRulePattern, setNewRulePattern] = useState('')
  const [newRuleSeverity, setNewRuleSeverity] = useState<'low' | 'medium' | 'high'>('medium')

  const metrics = useMemo(
    () => buildMetrics(result, scannedAt),
    [result, scannedAt]
  )

  const responsePayload = useMemo(
    () => result ? formatJson(result) : '',
    [result]
  )

  const rawMetrics = useMemo(
    () => metrics ? formatJson(metrics) : '',
    [metrics]
  )

  // Load history logs
  const fetchLogs = async (reset = false) => {
    setIsLoadingLogs(true)
    try {
      const currentCursor = reset ? null : nextCursor
      const data = await guardHistoryApi.list({
        cursor: currentCursor,
        limit: 15,
        decision: logDecisionFilter || undefined,
        intent: logIntentFilter || undefined,
      })

      if (reset) {
        setLogs(data.items)
      } else {
        setLogs((prev) => [...prev, ...data.items])
      }
      setNextCursor(data.next_cursor)
    } catch (err: unknown) {
      toast.error('Failed to load guard scan logs.')
    } finally {
      setIsLoadingLogs(false)
    }
  }

  // Load config
  const fetchConfig = async () => {
    setIsLoadingConfig(true)
    try {
      const data = await guardApi.getConfig()
      setConfig(data)
    } catch (err: unknown) {
      toast.error('Failed to load guard configuration settings.')
    } finally {
      setIsLoadingConfig(false)
    }
  }

  useEffect(() => {
    if (activeTab === 'history') {
      fetchLogs(true)
    } else if (activeTab === 'config') {
      fetchConfig()
    }
  }, [activeTab, logDecisionFilter, logIntentFilter])

  const handleScan = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()

    const trimmedPrompt = prompt.trim()

    if (!trimmedPrompt) {
      setError('Enter a prompt before running the guard scan.')
      setSubmittedPrompt('')
      setResult(null)
      setExplanation(null)
      setExplanationError(null)
      setScannedAt('')
      return
    }

    setSubmittedPrompt(trimmedPrompt)
    setIsLoading(true)
    setError(null)
    setResult(null)
    setExplanation(null)
    setExplanationError(null)
    setScannedAt('')

    try {
      const data = await guardApi.scan(trimmedPrompt)

      if (!data || typeof data !== 'object' || !data.decision) {
        setError('The server returned an empty or invalid response. Please try again.')
        return
      }

      setResult(data)
      setScannedAt(new Date().toISOString())
      toast.success('Prompt scanned successfully!')
    } catch (scanError: unknown) {
      const message = scanError instanceof Error
        ? scanError.message
        : 'Unable to run the guard scan right now.'

      setError(message)
    } finally {
      setIsLoading(false)
    }
  }

  const handleExplain = async () => {
    if (!submittedPrompt) return
    setIsExplaining(true)
    setExplanationError(null)
    try {
      const data = await guardApi.explain(submittedPrompt)
      setExplanation(data)
    } catch (err: unknown) {
      const message =
        err instanceof Error
          ? err.message
          : 'Unable to generate explanation right now.'
      setExplanationError(message)
    } finally {
      setIsExplaining(false)
    }
  }

  const handleExport = async (format: 'csv' | 'json' | 'html' | 'markdown') => {
    try {
      toast.loading(`Preparing ${format.toUpperCase()} export...`, { id: 'export' })
      const res = await guardHistoryApi.export({
        format,
        decision: logDecisionFilter || undefined,
        intent: logIntentFilter || undefined,
      })

      const blob = new Blob([res.data], { type: res.contentType })
      const url = window.URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = url
      link.setAttribute('download', `guard_scan_logs.${format === 'markdown' ? 'md' : format}`)
      document.body.appendChild(link)
      link.click()
      link.remove()
      window.URL.revokeObjectURL(url)
      toast.success(`${format.toUpperCase()} report downloaded!`, { id: 'export' })
    } catch (err: unknown) {
      toast.error('Failed to download export file.', { id: 'export' })
    }
  }

  // Config editing handlers
  const handleAddRule = () => {
    if (!config) return
    const trimmedName = newRuleName.trim()
    const trimmedPattern = newRulePattern.trim()

    if (!trimmedName || !trimmedPattern) {
      toast.error('Both name and pattern are required for custom rules.')
      return
    }

    try {
      new RegExp(trimmedPattern)
    } catch (e) {
      toast.error('Invalid regular expression pattern.')
      return
    }

    const newRule: CustomRegexRule = {
      name: trimmedName,
      pattern: trimmedPattern,
      severity: newRuleSeverity,
    }

    setConfig({
      ...config,
      custom_regex_rules: [...config.custom_regex_rules, newRule],
    })

    setNewRuleName('')
    setNewRulePattern('')
    setNewRuleSeverity('medium')
    toast.success('Custom regex rule staging added!')
  }

  const handleDeleteRule = (index: number) => {
    if (!config) return
    const updatedRules = [...config.custom_regex_rules]
    updatedRules.splice(index, 1)
    setConfig({
      ...config,
      custom_regex_rules: updatedRules,
    })
    toast.success('Custom rule removed!')
  }

  const handleSaveConfig = async () => {
    if (!config) return
    setIsSavingConfig(true)
    try {
      await guardApi.updateConfig(config)
      toast.success('Guard configuration saved successfully!')
    } catch (err: unknown) {
      toast.error('Failed to save configuration settings.')
    } finally {
      setIsSavingConfig(false)
    }
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex items-center gap-3">
          <div className="p-3 bg-primary-50 dark:bg-primary-900/30 rounded-xl">
            <ShieldCheck className="w-6 h-6 text-primary-600" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-gray-900 dark:text-white">LLM Guard</h1>
            <p className="text-gray-600 dark:text-gray-400">
              Scan prompts, trace threat attributions, and manage custom regex compliance rules.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 text-sm text-gray-500 dark:text-gray-400">
          <Activity className="w-4 h-4 text-primary-600" />
          <span>Compliance Guard Console</span>
        </div>
      </div>

      {/* Tabs */}
      <div className="border-b border-gray-200 dark:border-gray-700">
        <nav className="flex space-x-8" aria-label="Tabs">
          <button
            onClick={() => setActiveTab('scan')}
            className={`flex items-center gap-2 py-4 px-1 border-b-2 font-medium text-sm transition-colors ${
              activeTab === 'scan'
                ? 'border-primary-600 text-primary-600 dark:text-primary-400 dark:border-primary-400'
                : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300 dark:text-gray-400 dark:hover:text-gray-300'
            }`}
          >
            <ShieldCheck className="w-4 h-4" />
            Scan Console
          </button>
          <button
            onClick={() => setActiveTab('history')}
            className={`flex items-center gap-2 py-4 px-1 border-b-2 font-medium text-sm transition-colors ${
              activeTab === 'history'
                ? 'border-primary-600 text-primary-600 dark:text-primary-400 dark:border-primary-400'
                : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300 dark:text-gray-400 dark:hover:text-gray-300'
            }`}
          >
            <History className="w-4 h-4" />
            Scan History
          </button>
          <button
            onClick={() => setActiveTab('config')}
            className={`flex items-center gap-2 py-4 px-1 border-b-2 font-medium text-sm transition-colors ${
              activeTab === 'config'
                ? 'border-primary-600 text-primary-600 dark:text-primary-400 dark:border-primary-400'
                : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300 dark:text-gray-400 dark:hover:text-gray-300'
            }`}
          >
            <Settings className="w-4 h-4" />
            Policy Settings
          </button>
        </nav>
      </div>

      {/* Live Scan Tab */}
      {activeTab === 'scan' && (
        <>
          <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,1fr)_420px] gap-6">
            <section className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 shadow-sm overflow-hidden">
              <div className="px-5 py-4 border-b border-gray-200 dark:border-gray-700">
                <h2 className="text-lg font-semibold text-gray-900 dark:text-white">Scan prompt</h2>
              </div>

              <form onSubmit={handleScan} className="p-5 space-y-4">
                <label htmlFor="guard-prompt" className="sr-only">
                  Prompt to scan
                </label>
                <textarea
                  id="guard-prompt"
                  value={prompt}
                  onChange={(event) => setPrompt(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter' && (event.ctrlKey || event.metaKey)) {
                      const form = (event.target as HTMLTextAreaElement).closest('form')
                      if (form) form.requestSubmit()
                    }
                  }}
                  placeholder="Paste the prompt you want LLM Guard to inspect..."
                  rows={10}
                  disabled={isLoading}
                  className="w-full resize-y rounded-xl border border-gray-300 dark:border-gray-600 bg-transparent px-4 py-3 text-sm text-gray-900 dark:text-white placeholder:text-gray-400 dark:placeholder:text-gray-500 focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-500 disabled:bg-gray-50 dark:disabled:bg-gray-900 disabled:text-gray-500 dark:disabled:text-gray-600"
                />

                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <p className="text-xs text-gray-500 dark:text-gray-400">
                    The backend stores a hash for audit history, not the raw prompt.
                  </p>

                  <button
                    type="submit"
                    disabled={isLoading}
                    className="inline-flex items-center justify-center gap-2 rounded-lg bg-primary-600 px-4 py-2 text-sm font-semibold text-white hover:bg-primary-700 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {isLoading ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      <Send className="w-4 h-4" />
                    )}
                    Run scan
                  </button>
                </div>
              </form>
            </section>

            <aside className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 shadow-sm overflow-hidden">
              <div className="px-5 py-4 border-b border-gray-200 dark:border-gray-700">
                <h2 className="text-lg font-semibold text-gray-900 dark:text-white">Audit exports</h2>
              </div>

              <div className="p-5 space-y-4">
                <div className="flex items-center justify-between gap-3 rounded-xl border border-gray-200 dark:border-gray-700 p-4">
                  <div>
                    <p className="text-sm font-semibold text-gray-900 dark:text-white">Response payload</p>
                    <p className="text-xs text-gray-500 dark:text-gray-400">Exact scan API response JSON</p>
                  </div>
                  <CopyButton
                    text={responsePayload}
                    label="Copy"
                    successMessage="Response payload copied!"
                    disabled={!result}
                  />
                </div>

                <div className="flex items-center justify-between gap-3 rounded-xl border border-gray-200 dark:border-gray-700 p-4">
                  <div>
                    <p className="text-sm font-semibold text-gray-900 dark:text-white">Raw metrics</p>
                    <p className="text-xs text-gray-500 dark:text-gray-400">Decision, confidence, patterns, timestamp</p>
                  </div>
                  <CopyButton
                    text={rawMetrics}
                    label="Copy"
                    successMessage="Raw metrics copied!"
                    disabled={!metrics}
                  />
                </div>
              </div>
            </aside>
          </div>

          {isLoading && (
            <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-5 shadow-sm">
              <div className="flex items-center gap-3 text-gray-700 dark:text-gray-300">
                <Loader2 className="w-5 h-5 animate-spin text-primary-600" />
                <span className="text-sm font-medium">Running LLM Guard scan</span>
              </div>
            </div>
          )}

          {!isLoading && error && (
            <div className="rounded-xl border border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-900/20 p-5 text-red-800 dark:text-red-300">
              <div className="flex items-start gap-3">
                <AlertCircle className="w-5 h-5 mt-0.5 flex-shrink-0" />
                <div>
                  <h2 className="font-semibold">Scan failed</h2>
                  <p className="text-sm mt-1">{error}</p>
                </div>
              </div>
            </div>
          )}

          {!isLoading && result && metrics && (
            <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,1fr)_420px] gap-6">
              <section className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 shadow-sm overflow-hidden">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between px-5 py-4 border-b border-gray-200 dark:border-gray-700">
                  <div>
                    <h2 className="text-lg font-semibold text-gray-900 dark:text-white">Scan result</h2>
                    <p className="text-xs text-gray-500 dark:text-gray-400">
                      Scanned {new Date(scannedAt).toLocaleString()}
                    </p>
                  </div>

                  <div className="flex items-center gap-2">
                    <span
                      className={`inline-flex items-center rounded-full border px-3 py-1 text-xs font-semibold uppercase tracking-wide ${decisionBadgeClass(result.decision)}`}
                    >
                      {result.decision}
                    </span>
                    <button
                      type="button"
                      onClick={handleExplain}
                      disabled={isExplaining}
                      className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full border border-indigo-200 bg-indigo-50 text-xs font-medium text-indigo-700 hover:bg-indigo-100 disabled:opacity-60 disabled:cursor-wait transition-colors"
                      title="Generate token-level attribution for this scan"
                      aria-label="Explain this verdict"
                    >
                      {isExplaining ? (
                        <Loader2 className="w-3 h-3 animate-spin" />
                      ) : (
                        <Brain className="w-3 h-3" />
                      )}
                      {isExplaining ? 'Explaining…' : 'Explain'}
                    </button>
                  </div>
                </div>

                <div className="p-5 space-y-5">
                  <div>
                    <h3 className="text-sm font-semibold text-gray-900 dark:text-white mb-2">
                      Reasoning
                    </h3>
                    <p className="text-sm leading-6 text-gray-700 dark:text-gray-300">{result.reasoning}</p>
                  </div>

                  {result.sanitized_prompt && (
                    <div>
                      <h3 className="text-sm font-semibold text-gray-900 dark:text-white mb-2">
                        Sanitized prompt
                      </h3>
                      <pre className="whitespace-pre-wrap rounded-xl border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900 p-4 text-xs leading-6 text-gray-700 dark:text-gray-300">
                        {result.sanitized_prompt}
                      </pre>
                    </div>
                  )}

                  {submittedPrompt && (
                    <div>
                      <h3 className="text-sm font-semibold text-gray-900 dark:text-white mb-2">
                        Submitted prompt
                      </h3>
                      <pre className="max-h-56 overflow-auto whitespace-pre-wrap rounded-xl border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900 p-4 text-xs leading-6 text-gray-700 dark:text-gray-300">
                        {submittedPrompt}
                      </pre>
                    </div>
                  )}
                </div>
                {(explanation || explanationError) && (
                  <div className="border-t border-gray-200 dark:border-gray-700 p-5">
                    {explanationError ? (
                      <div className="text-sm text-amber-800 bg-amber-50 border border-amber-200 rounded-lg p-3">
                        <span className="font-medium">Couldn't generate explanation: </span>
                        {explanationError}
                      </div>
                    ) : (
                      explanation && (
                        <GuardExplanation
                          text={submittedPrompt}
                          explanation={explanation}
                        />
                      )
                    )}
                  </div>
                )}
              </section>

              <aside className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 shadow-sm overflow-hidden">
                <div className="px-5 py-4 border-b border-gray-200 dark:border-gray-700">
                  <h2 className="text-lg font-semibold text-gray-900 dark:text-white">Metrics</h2>
                </div>

                <div className="p-5 space-y-4">
                  <div className="grid grid-cols-2 gap-3">
                    <div className="rounded-xl border border-gray-200 dark:border-gray-700 p-4">
                      <div className="flex items-center gap-2 text-xs font-medium text-gray-500 dark:text-gray-400">
                        <Gauge className="w-4 h-4 text-primary-600" />
                        Confidence
                      </div>
                      <p className="mt-2 text-2xl font-bold text-gray-900 dark:text-white">
                        {(metrics.confidence * 100).toFixed(1)}%
                      </p>
                    </div>

                    <div className="rounded-xl border border-gray-200 dark:border-gray-700 p-4">
                      <div className="flex items-center gap-2 text-xs font-medium text-gray-500 dark:text-gray-400">
                        <ListChecks className="w-4 h-4 text-primary-600" />
                        Patterns
                      </div>
                      <p className="mt-2 text-2xl font-bold text-gray-900 dark:text-white">
                        {metrics.matchedPatternCount}
                      </p>
                    </div>
                  </div>

                  <div>
                    <h3 className="text-sm font-semibold text-gray-900 dark:text-white mb-2">
                      Matched patterns
                    </h3>
                    {metrics.matchedPatterns.length > 0 ? (
                      <div className="flex flex-wrap gap-2">
                        {metrics.matchedPatterns.map((pattern) => (
                          <span
                            key={pattern}
                            className="rounded-full bg-gray-100 dark:bg-gray-800 px-3 py-1 text-xs font-medium text-gray-700 dark:text-gray-300"
                          >
                            {pattern}
                          </span>
                        ))}
                      </div>
                    ) : (
                      <p className="text-sm text-gray-500 dark:text-gray-400">No regex patterns matched.</p>
                    )}
                  </div>

                  <div>
                    <h3 className="text-sm font-semibold text-gray-900 dark:text-white mb-2">
                      Raw metrics JSON
                    </h3>
                    <pre className="max-h-80 overflow-auto rounded-xl border border-gray-200 dark:border-gray-700 bg-gray-950 dark:bg-gray-950 p-4 text-xs leading-6 text-gray-100">
                      {rawMetrics}
                    </pre>
                  </div>
                </div>
              </aside>
            </div>
          )}
        </>
      )}

      {/* Scan History Tab */}
      {activeTab === 'history' && (
        <div className="space-y-6">
          {/* Filtration bar */}
          <div className="flex flex-wrap gap-4 items-center justify-between p-4 bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 shadow-sm">
            <div className="flex items-center gap-3">
              <Filter className="w-4 h-4 text-gray-400" />
              <span className="text-sm font-semibold text-gray-700 dark:text-gray-300">Filter logs:</span>
            </div>

            <div className="flex flex-wrap gap-3 items-center">
              <select
                value={logDecisionFilter}
                onChange={(e) => setLogDecisionFilter(e.target.value)}
                className="rounded-lg border border-gray-300 dark:border-gray-600 bg-transparent px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 dark:text-white"
              >
                <option value="">All Decisions</option>
                <option value="allow">Allow</option>
                <option value="sanitize">Sanitize</option>
                <option value="block">Block</option>
              </select>

              <select
                value={logIntentFilter}
                onChange={(e) => setLogIntentFilter(e.target.value)}
                className="rounded-lg border border-gray-300 dark:border-gray-600 bg-transparent px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 dark:text-white"
              >
                <option value="">All Intents</option>
                <option value="benign">Benign</option>
                <option value="suspicious">Suspicious</option>
                <option value="malicious">Malicious</option>
              </select>

              <div className="relative group">
                <button
                  type="button"
                  className="inline-flex items-center justify-center gap-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-transparent px-3 py-1.5 text-sm font-semibold hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors dark:text-white"
                >
                  <Download className="w-4 h-4" />
                  Export Logs
                </button>
                <div className="absolute right-0 mt-1 w-48 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg shadow-lg py-1 z-10 hidden group-hover:block hover:block">
                  <button
                    type="button"
                    onClick={() => handleExport('csv')}
                    className="w-full text-left px-4 py-2 text-sm text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700"
                  >
                    Export as CSV
                  </button>
                  <button
                    type="button"
                    onClick={() => handleExport('json')}
                    className="w-full text-left px-4 py-2 text-sm text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700"
                  >
                    Export as JSON
                  </button>
                  <button
                    type="button"
                    onClick={() => handleExport('html')}
                    className="w-full text-left px-4 py-2 text-sm text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700"
                  >
                    Export as HTML Report
                  </button>
                  <button
                    type="button"
                    onClick={() => handleExport('markdown')}
                    className="w-full text-left px-4 py-2 text-sm text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700"
                  >
                    Export as Markdown
                  </button>
                </div>
              </div>
            </div>
          </div>

          {/* Logs List */}
          {isLoadingLogs && logs.length === 0 ? (
            <div className="flex items-center justify-center p-12 bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700">
              <Loader2 className="w-8 h-8 animate-spin text-primary-600" />
            </div>
          ) : logs.length === 0 ? (
            <div className="flex flex-col items-center justify-center p-12 bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 text-center">
              <ShieldCheck className="w-12 h-12 text-gray-400 mb-3" />
              <p className="text-gray-600 dark:text-gray-400">No scan history logs found matching these filters.</p>
            </div>
          ) : (
            <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 shadow-sm overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse text-sm">
                  <thead>
                    <tr className="bg-gray-50 dark:bg-gray-700/50 border-b border-gray-200 dark:border-gray-700">
                      <th className="p-4 font-semibold text-gray-600 dark:text-gray-300">Timestamp</th>
                      <th className="p-4 font-semibold text-gray-600 dark:text-gray-300">Decision</th>
                      <th className="p-4 font-semibold text-gray-600 dark:text-gray-300">Confidence</th>
                      <th className="p-4 font-semibold text-gray-600 dark:text-gray-300">Reasoning Summary</th>
                      <th className="p-4 font-semibold text-gray-600 dark:text-gray-300">Matched Rules</th>
                      <th className="p-4 font-semibold text-gray-600 dark:text-gray-300"></th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100 dark:divide-gray-700">
                    {logs.map((log) => (
                      <tr key={log.id} className="hover:bg-gray-50 dark:hover:bg-gray-700/20 transition-colors">
                        <td className="p-4 text-xs text-gray-500 dark:text-gray-400">
                          {log.scanned_at ? new Date(log.scanned_at).toLocaleString() : 'N/A'}
                        </td>
                        <td className="p-4">
                          <span
                            className={`inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-semibold uppercase tracking-wide ${decisionBadgeClass(
                              log.decision
                            )}`}
                          >
                            {log.decision}
                          </span>
                        </td>
                        <td className="p-4 font-medium text-gray-900 dark:text-white">
                          {(log.confidence * 100).toFixed(1)}%
                        </td>
                        <td className="p-4 text-gray-600 dark:text-gray-400 truncate max-w-xs">
                          {log.reasoning}
                        </td>
                        <td className="p-4">
                          <div className="flex flex-wrap gap-1.5 max-w-xs">
                            {log.matched_patterns && log.matched_patterns.length > 0 ? (
                              log.matched_patterns.slice(0, 2).map((p) => (
                                <span
                                  key={p}
                                  className="text-xs bg-gray-100 dark:bg-gray-900 text-gray-700 dark:text-gray-300 px-2 py-0.5 rounded-md truncate max-w-[120px]"
                                  title={p}
                                >
                                  {p.split(':')[0]}
                                </span>
                              ))
                            ) : (
                              <span className="text-xs text-gray-400">None</span>
                            )}
                            {log.matched_patterns && log.matched_patterns.length > 2 && (
                              <span className="text-xs bg-gray-200 dark:bg-gray-800 px-2 py-0.5 rounded-md font-semibold">
                                +{log.matched_patterns.length - 2}
                              </span>
                            )}
                          </div>
                        </td>
                        <td className="p-4 text-right">
                          <button
                            onClick={() => setSelectedLog(log)}
                            className="p-1.5 text-gray-400 hover:text-primary-600 dark:hover:text-primary-400 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700"
                            title="View log details"
                          >
                            <Maximize2 className="w-4 h-4" />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {nextCursor && (
                <div className="p-4 border-t border-gray-200 dark:border-gray-700 text-center">
                  <button
                    onClick={() => fetchLogs(false)}
                    disabled={isLoadingLogs}
                    className="inline-flex items-center gap-2 px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-sm font-medium hover:bg-gray-50 dark:hover:bg-gray-700 disabled:opacity-60 transition-colors dark:text-white"
                  >
                    {isLoadingLogs ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      'Load More'
                    )}
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* Policy Configuration Tab */}
      {activeTab === 'config' && (
        <div className="space-y-6">
          {isLoadingConfig ? (
            <div className="flex items-center justify-center p-12 bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700">
              <Loader2 className="w-8 h-8 animate-spin text-primary-600" />
            </div>
          ) : !config ? (
            <div className="p-5 bg-white dark:bg-gray-800 rounded-xl border border-red-200 dark:border-red-800 text-center">
              <p className="text-red-600">Failed to initialize configuration settings.</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 lg:grid-cols-[1fr_400px] gap-6 items-start">
              {/* Sliders & Dropdown */}
              <div className="space-y-6">
                <section className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-5 shadow-sm space-y-5">
                  <h2 className="text-lg font-semibold text-gray-900 dark:text-white flex items-center gap-2">
                    <Sliders className="w-5 h-5 text-primary-600" />
                    Verdict Sensitivity Thresholds
                  </h2>

                  <div className="space-y-4">
                    <div>
                      <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-1">
                        Sanitization Aggressiveness
                      </label>
                      <select
                        value={config.sanitization_level}
                        onChange={(e) => setConfig({ ...config, sanitization_level: e.target.value })}
                        className="w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-transparent px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 dark:text-white"
                      >
                        <option value="low">Low (Sanitize extreme risk patterns only)</option>
                        <option value="medium">Medium (Standard sanitization filters)</option>
                        <option value="high">High (Aggressive safety sanitization)</option>
                      </select>
                    </div>

                    <div>
                      <div className="flex justify-between items-center text-sm font-semibold text-gray-700 dark:text-gray-300 mb-1">
                        <span>Malicious Action Threshold</span>
                        <span className="text-primary-600 dark:text-primary-400">{(config.malicious_threshold * 100).toFixed(0)}%</span>
                      </div>
                      <input
                        type="range"
                        min="0"
                        max="1"
                        step="0.05"
                        value={config.malicious_threshold}
                        onChange={(e) => setConfig({ ...config, malicious_threshold: parseFloat(e.target.value) })}
                        className="w-full accent-primary-600"
                      />
                      <span className="text-xs text-gray-400">Verdicts with scores above this are immediately blocked.</span>
                    </div>

                    <div>
                      <div className="flex justify-between items-center text-sm font-semibold text-gray-700 dark:text-gray-300 mb-1">
                        <span>Suspicious Action Threshold</span>
                        <span className="text-primary-600 dark:text-primary-400">{(config.suspicious_threshold * 100).toFixed(0)}%</span>
                      </div>
                      <input
                        type="range"
                        min="0"
                        max="1"
                        step="0.05"
                        value={config.suspicious_threshold}
                        onChange={(e) => setConfig({ ...config, suspicious_threshold: parseFloat(e.target.value) })}
                        className="w-full accent-primary-600"
                      />
                      <span className="text-xs text-gray-400">Verdicts above this but below malicious score are sanitized before evaluation.</span>
                    </div>
                  </div>
                </section>

                {/* Custom Regex Rules list */}
                <section className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-5 shadow-sm space-y-4">
                  <h2 className="text-lg font-semibold text-gray-900 dark:text-white flex items-center gap-2">
                    <ListChecks className="w-5 h-5 text-primary-600" />
                    Custom Active Regex Rules
                  </h2>

                  {config.custom_regex_rules.length === 0 ? (
                    <div className="p-8 text-center border border-dashed border-gray-300 dark:border-gray-700 rounded-xl text-gray-500">
                      No custom regex patterns defined. Use the sidebar rules form to add custom patterns.
                    </div>
                  ) : (
                    <div className="overflow-x-auto border border-gray-200 dark:border-gray-700 rounded-lg">
                      <table className="w-full text-left text-sm border-collapse">
                        <thead>
                          <tr className="bg-gray-50 dark:bg-gray-700/50 border-b border-gray-200 dark:border-gray-700">
                            <th className="p-3 font-semibold text-gray-600 dark:text-gray-300">Rule Name</th>
                            <th className="p-3 font-semibold text-gray-600 dark:text-gray-300">Regex Pattern</th>
                            <th className="p-3 font-semibold text-gray-600 dark:text-gray-300">Severity</th>
                            <th className="p-3 font-semibold text-gray-600 dark:text-gray-300"></th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100 dark:divide-gray-700">
                          {config.custom_regex_rules.map((rule, idx) => (
                            <tr key={idx} className="hover:bg-gray-50 dark:hover:bg-gray-700/20">
                              <td className="p-3 font-semibold text-gray-900 dark:text-white">{rule.name}</td>
                              <td className="p-3 text-xs text-gray-500 dark:text-gray-400 font-mono">{rule.pattern}</td>
                              <td className="p-3">
                                <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium border ${
                                  rule.severity === 'high'
                                    ? 'bg-red-50 text-red-700 border-red-200 dark:bg-red-900/20 dark:text-red-400'
                                    : rule.severity === 'medium'
                                    ? 'bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-900/20 dark:text-amber-400'
                                    : 'bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-900/20 dark:text-blue-400'
                                }`}>
                                  {rule.severity}
                                </span>
                              </td>
                              <td className="p-3 text-right">
                                <button
                                  type="button"
                                  onClick={() => handleDeleteRule(idx)}
                                  className="p-1 text-gray-400 hover:text-red-600 dark:hover:text-red-400 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700"
                                >
                                  <Trash2 className="w-4 h-4" />
                                </button>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}

                  <div className="flex justify-end pt-4">
                    <button
                      onClick={handleSaveConfig}
                      disabled={isSavingConfig}
                      className="inline-flex items-center justify-center gap-2 rounded-lg bg-primary-600 px-5 py-2 text-sm font-semibold text-white hover:bg-primary-700 disabled:cursor-not-allowed disabled:opacity-60 transition-colors"
                    >
                      {isSavingConfig ? (
                        <Loader2 className="w-4 h-4 animate-spin" />
                      ) : (
                        'Save Configuration'
                      )}
                    </button>
                  </div>
                </section>
              </div>

              {/* Add rule sidebar */}
              <aside className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-5 shadow-sm space-y-4">
                <h2 className="text-lg font-semibold text-gray-900 dark:text-white flex items-center gap-2">
                  <Plus className="w-5 h-5 text-primary-600" />
                  Add Custom Rule
                </h2>

                <div className="space-y-3">
                  <div>
                    <label className="block text-xs font-semibold text-gray-600 dark:text-gray-400 mb-1">
                      Rule Name
                    </label>
                    <input
                      type="text"
                      placeholder="e.g. Secret Hash Match"
                      value={newRuleName}
                      onChange={(e) => setNewRuleName(e.target.value)}
                      className="w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-transparent px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 dark:text-white"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-gray-600 dark:text-gray-400 mb-1">
                      Regex Pattern
                    </label>
                    <input
                      type="text"
                      placeholder="e.g. SEC-[0-9]{5}"
                      value={newRulePattern}
                      onChange={(e) => setNewRulePattern(e.target.value)}
                      className="w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-transparent px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 font-mono dark:text-white"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-gray-600 dark:text-gray-400 mb-1">
                      Severity Level
                    </label>
                    <select
                      value={newRuleSeverity}
                      onChange={(e) => setNewRuleSeverity(e.target.value as 'low' | 'medium' | 'high')}
                      className="w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-transparent px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 dark:text-white"
                    >
                      <option value="low">Low (Score 0.3)</option>
                      <option value="medium">Medium (Score 0.7)</option>
                      <option value="high">High (Score 1.0)</option>
                    </select>
                  </div>

                  <button
                    type="button"
                    onClick={handleAddRule}
                    className="w-full mt-2 inline-flex items-center justify-center gap-1.5 rounded-lg bg-primary-50 hover:bg-primary-100 dark:bg-primary-900/30 dark:hover:bg-primary-900/50 px-4 py-2 text-sm font-semibold text-primary-700 dark:text-primary-400 transition-colors"
                  >
                    <Plus className="w-4 h-4" />
                    Stage Custom Rule
                  </button>
                </div>
              </aside>
            </div>
          )}
        </div>
      )}

      {/* Details Modal */}
      {selectedLog && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
          <div className="w-full max-w-3xl bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-2xl shadow-xl overflow-hidden flex flex-col max-h-[85vh]">
            {/* Modal Header */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-700/50">
              <div>
                <h3 className="text-lg font-bold text-gray-900 dark:text-white">Audit Log Details</h3>
                <p className="text-xs text-gray-500 dark:text-gray-400">
                  ID: #{selectedLog.id} &bull; {selectedLog.scanned_at ? new Date(selectedLog.scanned_at).toLocaleString() : ''}
                </p>
              </div>
              <button
                onClick={() => setSelectedLog(null)}
                className="p-1.5 text-gray-400 hover:text-gray-600 dark:hover:text-white rounded-lg hover:bg-gray-200 dark:hover:bg-gray-600"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Modal Body */}
            <div className="p-6 space-y-6 overflow-y-auto">
              <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                <div className="rounded-xl border border-gray-200 dark:border-gray-700 p-4">
                  <span className="text-xs text-gray-500 dark:text-gray-400">Verdict</span>
                  <div className="mt-1.5">
                    <span
                      className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold uppercase tracking-wide ${decisionBadgeClass(
                        selectedLog.decision
                      )}`}
                    >
                      {selectedLog.decision}
                    </span>
                  </div>
                </div>

                <div className="rounded-xl border border-gray-200 dark:border-gray-700 p-4">
                  <span className="text-xs text-gray-500 dark:text-gray-400">Confidence Score</span>
                  <p className="mt-1 text-xl font-bold text-gray-900 dark:text-white">
                    {(selectedLog.confidence * 100).toFixed(1)}%
                  </p>
                </div>

                <div className="rounded-xl border border-gray-200 dark:border-gray-700 p-4 col-span-2 md:col-span-1">
                  <span className="text-xs text-gray-500 dark:text-gray-400">Rules Triggered</span>
                  <p className="mt-1 text-xl font-bold text-gray-900 dark:text-white">
                    {selectedLog.matched_patterns ? selectedLog.matched_patterns.length : 0}
                  </p>
                </div>
              </div>

              <div>
                <h4 className="text-sm font-semibold text-gray-900 dark:text-white mb-2">Verdict Reasoning</h4>
                <p className="text-sm leading-6 text-gray-700 dark:text-gray-300 bg-gray-50 dark:bg-gray-900/50 p-4 rounded-xl border border-gray-200 dark:border-gray-700">
                  {selectedLog.reasoning}
                </p>
              </div>

              {selectedLog.matched_patterns && selectedLog.matched_patterns.length > 0 && (
                <div>
                  <h4 className="text-sm font-semibold text-gray-900 dark:text-white mb-2">Matched Patterns list</h4>
                  <div className="flex flex-wrap gap-2">
                    {selectedLog.matched_patterns.map((pattern) => (
                      <span
                        key={pattern}
                        className="rounded-full bg-gray-100 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 px-3 py-1 text-xs font-medium text-gray-700 dark:text-gray-300"
                      >
                        {pattern}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {selectedLog.sanitized_prompt && (
                <div>
                  <h4 className="text-sm font-semibold text-gray-900 dark:text-white mb-2">Sanitized Prompt Preview</h4>
                  <pre className="whitespace-pre-wrap rounded-xl border border-gray-200 dark:border-gray-700 bg-amber-50/20 dark:bg-amber-900/10 p-4 text-xs leading-6 text-gray-700 dark:text-gray-300">
                    {selectedLog.sanitized_prompt}
                  </pre>
                </div>
              )}
            </div>

            {/* Modal Footer */}
            <div className="flex justify-end gap-3 px-6 py-4 border-t border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-700/50">
              <button
                type="button"
                onClick={() => setSelectedLog(null)}
                className="px-4 py-2 text-sm font-semibold text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg border border-gray-300 dark:border-gray-600 transition-colors"
              >
                Close Details
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}