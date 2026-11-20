import { useEffect, useState } from 'react'
import { AnimatePresence, motion } from 'motion/react'
import { Check, X } from 'lucide-react'
import { QUIZ_QUESTIONS, pickQuestions } from '../lib/games'
import { Button } from '../components/ui'
import { GameFrame, useGame } from './useGame'

type Reveal = {
  answers: Record<'p1' | 'p2', number[]>
  guesses: Record<'p1' | 'p2', number[]>
  scores: Record<'p1' | 'p2', number>
}

export default function Quiz() {
  const g = useGame('quiz')
  const game = g.game
  const questions: number[] = game?.state.questions ?? []
  const submitted: Record<string, boolean> = game?.state.submitted ?? {}
  const reveal = game?.state.reveal as Reveal | undefined
  const iPlayed = Boolean(g.key && submitted[g.key])
  const theyPlayed = Boolean(submitted[g.otherKey])

  const [answers, setAnswers] = useState<(number | null)[]>([])
  const [guesses, setGuesses] = useState<(number | null)[]>([])
  const [step, setStep] = useState(0)

  useEffect(() => {
    setAnswers(questions.map(() => null))
    setGuesses(questions.map(() => null))
    setStep(0)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [game?.id])

  const total = questions.length
  const q = QUIZ_QUESTIONS[questions[step] ?? 0]
  const stepDone = answers[step] != null && guesses[step] != null
  const allDone = total > 0 && answers.every((a) => a != null) && guesses.every((a) => a != null)

  const submit = () => {
    if (!game || !allDone) return
    void g.run(async () => {
      await g.api.quizPlay(game.id, answers as number[], guesses as number[])
      await g.reload()
    })
  }

  let status: string
  if (reveal) status = ''
  else if (iPlayed) status = `Locked in ♡ — waiting for ${g.partnerName}`
  else status = theyPlayed ? `${g.partnerName} has played — your turn!` : 'Answer about you, guess about them'

  return (
    <GameFrame
      kind="quiz"
      g={g}
      status={status}
      emptyText={`Six little questions. Answer them about yourself, then guess what ${g.partnerName} picked. Nothing shows until you've both played.`}
      onNewGame={() => void g.newGame({ questions: pickQuestions(6) })}
    >
      {game && !reveal && !iPlayed && q && (
        <div className="mx-auto max-w-md">
          <div className="mb-3 flex justify-center gap-1.5" aria-label={`Question ${step + 1} of ${total}`}>
            {questions.map((_, i) => (
              <button
                key={i}
                type="button"
                onClick={() => setStep(i)}
                aria-label={`Question ${i + 1}`}
                className={`h-2 rounded-full transition-all ${i === step ? 'w-6 bg-rose-deep' : answers[i] != null && guesses[i] != null ? 'w-2 bg-peacock' : 'w-2 bg-ink-soft/25'}`}
              />
            ))}
          </div>
          <AnimatePresence mode="wait">
            <motion.div
              key={step}
              initial={{ opacity: 0, x: 24 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -24 }}
              className="paper flex flex-col gap-5 p-5"
            >
              <p className="eyebrow text-center">
                {step + 1} of {total}
              </p>
              <h2 className="-mt-3 text-center font-display text-2xl text-peacock-deep first-letter:uppercase">{q.about}</h2>
              <Choices title="Your answer" options={q.options} value={answers[step] ?? null} onPick={(v) => setAnswers((a) => a.map((x, i) => (i === step ? v : x)))} />
              <Choices
                title={`What will ${g.partnerName} say?`}
                options={q.options}
                value={guesses[step] ?? null}
                onPick={(v) => setGuesses((a) => a.map((x, i) => (i === step ? v : x)))}
                tone="guess"
              />
              <div className="flex justify-between gap-2">
                <Button variant="ghost" onClick={() => setStep((s) => Math.max(0, s - 1))} disabled={step === 0}>
                  Back
                </Button>
                {step < total - 1 ? (
                  <Button onClick={() => setStep((s) => s + 1)} disabled={!stepDone}>
                    Next
                  </Button>
                ) : (
                  <Button onClick={submit} disabled={!allDone} busy={g.busy}>
                    Lock in ♡
                  </Button>
                )}
              </div>
            </motion.div>
          </AnimatePresence>
        </div>
      )}

      {game && !reveal && iPlayed && (
        <div className="paper mx-auto flex max-w-sm flex-col items-center gap-2 px-6 py-8 text-center">
          <span className="text-4xl">💌</span>
          <p className="text-ink-soft">
            Your answers are sealed. When {g.partnerName} plays, you'll both see how well you know each other.
          </p>
        </div>
      )}

      {game && reveal && g.key && <Results reveal={reveal} questions={questions} me={g.key} other={g.otherKey} partnerName={g.partnerName} />}
    </GameFrame>
  )
}

function Choices({
  title,
  options,
  value,
  onPick,
  tone = 'self',
}: {
  title: string
  options: readonly string[]
  value: number | null
  onPick: (v: number) => void
  tone?: 'self' | 'guess'
}) {
  const on = tone === 'self' ? 'border-rose-deep bg-blush/70 text-rose-deep' : 'border-peacock bg-peacock/15 text-peacock-deep'
  return (
    <fieldset>
      <legend className="mb-2 text-sm font-semibold text-ink">{title}</legend>
      <div className="grid grid-cols-2 gap-2">
        {options.map((o, i) => (
          <button
            key={o}
            type="button"
            onClick={() => onPick(i)}
            aria-pressed={value === i}
            className={`min-h-11 rounded-xl border-2 px-3 py-2 text-sm transition ${value === i ? on : 'border-transparent bg-parchment/70 text-ink hover:bg-parchment'}`}
          >
            {o}
          </button>
        ))}
      </div>
    </fieldset>
  )
}

function Results({
  reveal,
  questions,
  me,
  other,
  partnerName,
}: {
  reveal: Reveal
  questions: number[]
  me: 'p1' | 'p2'
  other: 'p1' | 'p2'
  partnerName: string
}) {
  const total = questions.length
  return (
    <div className="mx-auto max-w-xl">
      <div className="mb-4 grid grid-cols-2 gap-3 text-center">
        <div className="paper px-3 py-4">
          <p className="eyebrow">You know {partnerName}</p>
          <p className="font-display text-4xl text-rose-deep">
            {reveal.scores[me]}/{total}
          </p>
        </div>
        <div className="paper px-3 py-4">
          <p className="eyebrow">{partnerName} knows you</p>
          <p className="font-display text-4xl text-peacock-deep">
            {reveal.scores[other]}/{total}
          </p>
        </div>
      </div>
      <ol className="flex flex-col gap-3">
        {questions.map((qi, i) => {
          const q = QUIZ_QUESTIONS[qi]!
          const myGuessRight = reveal.guesses[me][i] === reveal.answers[other][i]
          const theirGuessRight = reveal.guesses[other][i] === reveal.answers[me][i]
          return (
            <li key={qi} className="paper p-4">
              <p className="mb-2 font-display text-lg text-peacock-deep first-letter:uppercase">{q.about}</p>
              <Row label={`${partnerName} said`} answer={q.options[reveal.answers[other][i]!]!} guessLabel="you guessed" guess={q.options[reveal.guesses[me][i]!]!} right={myGuessRight} />
              <Row label="You said" answer={q.options[reveal.answers[me][i]!]!} guessLabel={`${partnerName} guessed`} guess={q.options[reveal.guesses[other][i]!]!} right={theirGuessRight} />
            </li>
          )
        })}
      </ol>
    </div>
  )
}

function Row({ label, answer, guessLabel, guess, right }: { label: string; answer: string; guessLabel: string; guess: string; right: boolean }) {
  return (
    <p className="flex items-start gap-2 py-1 text-sm">
      <span className={`mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full ${right ? 'bg-sage/40 text-sage-deep' : 'bg-blush text-rose-deep'}`}>
        {right ? <Check className="size-3.5" aria-label="Right" /> : <X className="size-3.5" aria-label="Wrong" />}
      </span>
      <span>
        <span className="text-ink-soft">{label}</span> <strong className="font-semibold">{answer}</strong>
        {!right && (
          <>
            {' '}
            · <span className="text-ink-soft">{guessLabel}</span> {guess}
          </>
        )}
      </span>
    </p>
  )
}
