import React, { useState } from 'react'
import RealmWizardController from './controller/RealmWizardController'
// import CreateRealmForm from './components/CreateRealmForm'
import Loading from '@components/Loading'
import WizardModeSelect from './components/Steps/WizardModeSelect'
import { notify } from '@utils/notifications'
import { StepOne, StepThree, StepFour, RealmCreated } from './components/Steps'
import { useMemo } from 'react'
import Button from '@components/Button'
import {
  RealmArtifacts,
  RealmWizardMode,
  RealmWizardStep,
  StepDirection,
} from './interfaces/Realm'
import { PublicKey } from '@solana/web3.js'
import useWalletStore from 'stores/useWalletStore'
import { DEFAULT_GOVERNANCE_PROGRAM_ID } from '@components/instructions/tools'
import { ProgramVersion } from '@models/registry/constants'

import { createMultisigRealm } from 'actions/createMultisigRealm'
import { ArrowLeftIcon } from '@heroicons/react/solid'
import useQueryContext from '@hooks/useQueryContext'
import router from 'next/router'
import CreateRealmForm from './components/CreateRealmForm'
import { useEffect } from 'react'

enum LoaderMessage {
  CREATING_ARTIFACTS = 'Creating the Realm artifacts..',
  MINTING_COUNCIL_TOKENS = 'Minting the council tokens..',
  MINTING_COMMUNITY_TOKENS = 'Minting the community tokens..',
  DEPLOYING_REALM = 'Deploying the Realm..',
  COMPLETING_REALM = 'Finishing the Realm buildings..',
  FINISHED = "Realm successfully created. Redirecting to the realm's page",
  ERROR = 'We found an error while creating your Realm :/',
}

const RealmWizard: React.FC = () => {
  const { fmtUrlWithCluster } = useQueryContext()
  // const wallet = useWalletStore((s) => s.current)
  const { connection, current: wallet } = useWalletStore((s) => s)
  /**
   * @var {RealmWizardController} ctl
   * The wizard controller instance
   */
  const [ctl, setController] = useState<RealmWizardController>()

  const [form, setForm] = useState<RealmArtifacts>({
    yesThreshold: 60,
  })
  const [isLoading, setIsLoading] = useState(false)
  const [currentStep, setCurrentStep] = useState<RealmWizardStep>(
    RealmWizardStep.SELECT_MODE
  )
  const [realmAddress] = useState('')
  const [loaderMessage, setLoaderMessage] = useState<LoaderMessage>(
    LoaderMessage.DEPLOYING_REALM
  )

  // TODO: This state will be removed in future versions
  const [shouldFireCreate, setShouldFireCreate] = useState(false)

  /**
   * Handles and set the form data
   * @param data the form data
   */
  const handleSetForm = (data: RealmArtifacts) => {
    setForm({
      ...form,
      ...data,
    })
  }

  /**
   * Generate realm artifacts
   */
  const generateRealmArtifacts = async () => {
    if (!ctl) return
    if (!wallet?.publicKey || !connection.current) return
    if (!form.name)
      return notify({
        type: 'error',
        message: 'You must set a name for the realm!',
      })

    if (!form.teamWallets?.length)
      return notify({
        type: 'error',
        message: 'Team member wallets are required.',
      })

    if (!form.yesThreshold) {
      return notify({
        type: 'error',
        message: 'Approval quorum required.',
      })
    }

    setIsLoading(true)

    // TODO: make it part of the form
    const programId =
      process.env.DEFAULT_GOVERNANCE_PROGRAM_ID ?? DEFAULT_GOVERNANCE_PROGRAM_ID

    const results = await createMultisigRealm(
      connection.current,
      new PublicKey(programId),
      ProgramVersion.V1,
      form.name,
      form.yesThreshold,
      form.teamWallets.map((w) => new PublicKey(w)),
      wallet
    )

    if (results) {
      return results
    }

    notify({
      type: 'error',
      message: 'Something bad happened during this request.',
    })
  }

  /**
   * Handles and set the selected mode
   * @param option the selected mode
   */
  const handleModeSelection = (option: RealmWizardMode) => {
    try {
      const ctl = new RealmWizardController(option)
      const nextStep = ctl.getNextStep(currentStep, StepDirection.NEXT)
      console.log(ctl)
      setController(ctl)
      setCurrentStep(nextStep)
    } catch (error) {
      notify({
        type: 'error',
        message: error.message,
      })
    }
  }

  const handleStepSelection = (direction: StepDirection) => {
    if (ctl) {
      try {
        const nextStep = ctl.getNextStep(currentStep, direction)
        setCurrentStep(nextStep)
      } catch (error) {
        notify({
          type: 'error',
          message: error.message,
        })
      }
    }
  }

  const handleCreateRealm = async () => {
    if (!wallet?.publicKey || !connection.current)
      return notify({
        type: 'error',
        message: 'Wallet not connected',
      })
    // Handles the current misuse of the CreateRealmForm
    if (ctl && ctl.getMode() === RealmWizardMode.ADVANCED) {
      setShouldFireCreate(true)
      return
    }
    setIsLoading(true)
    try {
      const realm = await generateRealmArtifacts()
      setIsLoading(false)
      if (realm) {
        setLoaderMessage(LoaderMessage.FINISHED)
        router.push(fmtUrlWithCluster(`/dao/${realm.realmPk.toBase58()}`))
      }
    } catch (error) {
      const err = error as Error
      setIsLoading(false)
      notify({
        type: 'error',
        message: err.message,
      })
    }
  }

  const handleBackButtonClick = () => {
    if (ctl && !ctl.isFirstStep()) {
      setCurrentStep(ctl.getNextStep(currentStep, StepDirection.PREV))
    } else {
      router.push(fmtUrlWithCluster('/realms'))
    }
  }

  const isCreateButtonDisabled = () =>
    ctl && ctl.getMode() === RealmWizardMode.ADVANCED
      ? false
      : !form.teamWallets?.length || !form.name

  /**
   * Binds the current step to the matching component
   */
  const BoundStepComponent = useMemo(() => {
    switch (currentStep) {
      case RealmWizardStep.SELECT_MODE:
        return <WizardModeSelect onSelect={handleModeSelection} />
      case RealmWizardStep.BASIC_CONFIG:
        return <StepOne form={form} setForm={handleSetForm} />
      case RealmWizardStep.TOKENS_CONFIG:
        return (
          <CreateRealmForm
            form={form}
            setForm={handleSetForm}
            shouldFireCreate={shouldFireCreate}
            setIsLoading={setIsLoading}
          />
        )
      case RealmWizardStep.STEP_3:
        return <StepThree form={form} setForm={handleSetForm} />
      case RealmWizardStep.STEP_4:
        return <StepFour form={form} setForm={handleSetForm} />
      case RealmWizardStep.REALM_CREATED:
        return <RealmCreated realmAddress={realmAddress} />
      default:
        return <h4>Sorry, but this step ran away</h4>
    }
  }, [currentStep, form, shouldFireCreate])

  useEffect(() => {
    // Return shouldFireCreate to the base state
    if (shouldFireCreate) {
      setTimeout(() => {
        setShouldFireCreate(false)
      }, 1000)
    }
  }, [shouldFireCreate])

  useEffect(() => {
    setForm({
      governanceProgramId:
        process.env.DEFAULT_GOVERNANCE_PROGRAM_ID ??
        DEFAULT_GOVERNANCE_PROGRAM_ID,
    })
  }, [])

  return (
    <div
      className="relative w-full"
      style={
        ctl && ctl.getCurrentStep() !== RealmWizardStep.SELECT_MODE
          ? { maxWidth: 512 }
          : undefined
      }
    >
      <div className="pointer">
        <a
          className="flex items-center text-fgd-3 text-sm transition-all hover:text-fgd-1"
          onClick={handleBackButtonClick}
        >
          <ArrowLeftIcon className="h-4 w-4 mr-1 text-primary-light" />
          Back
        </a>
      </div>
      {isLoading ? (
        <div className="text-center">
          <Loading />
          <span>{loaderMessage}</span>
        </div>
      ) : (
        BoundStepComponent
      )}
      {ctl && !(ctl.isFirstStep() || isLoading) && (
        <div className="flex justify-end pr-10 mr-3">
          <Button
            onClick={() => {
              if (ctl.isLastStep()) handleCreateRealm()
              else handleStepSelection(StepDirection.NEXT)
            }}
            disabled={isCreateButtonDisabled()}
          >
            {ctl.isLastStep() ? 'Create' : 'Next'}
          </Button>
        </div>
      )}
    </div>
  )
}

export default RealmWizard
