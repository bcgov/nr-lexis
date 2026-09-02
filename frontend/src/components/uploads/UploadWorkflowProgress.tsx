type UploadWorkflowStep = {
  id: string
  label: string
}

type UploadWorkflowProgressProps = {
  steps: UploadWorkflowStep[]
  currentStepId: string
  completedStepIds?: string[]
  ariaLabel: string
}

function UploadWorkflowProgress({
  steps,
  currentStepId,
  completedStepIds = [],
  ariaLabel,
}: UploadWorkflowProgressProps) {
  const completedSteps = new Set(completedStepIds)

  return (
    <div className="admin-upload-progress" role="list" aria-label={ariaLabel}>
      {steps.map((step, index) => {
        const isCurrent = step.id === currentStepId
        const isComplete = completedSteps.has(step.id)
        const stateClassName = isCurrent
          ? 'is-current'
          : isComplete
            ? 'is-complete'
            : 'is-incomplete'

        return (
          <div
            key={step.id}
            className={`admin-upload-progress__step ${stateClassName}`}
            role="listitem"
            {...(isCurrent ? { 'aria-current': 'step' as const } : {})}
          >
            <span className="admin-upload-progress__step-inner">
              <span className="admin-upload-progress__dot" aria-hidden="true" />
              <span className="admin-upload-progress__label">
                {index + 1}. {step.label}
              </span>
            </span>
          </div>
        )
      })}
    </div>
  )
}

export default UploadWorkflowProgress
