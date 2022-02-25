const { isEmpty, isObject, isArray, isString, reduce, map, isNull, isUndefined, isNaN, cloneDeep } = require('lodash')
const { doNotAllowMissingProperties, allowMissingProperties } = require('./doNotAllowMissingProperties')

const HaltExecution = {}

const Command = class {
  inputs
  get success () { return this.outcome.success }
  get result () { return this.outcome.result }
  get errors () { return this.outcome.errors }
  get schema () { return this.constructor.schema }

  _rawInputs
  _outcome
  _started
  _completed

  constructor (inputs = {}) {
    this._rawInputs = inputs
    this.inputs = doNotAllowMissingProperties(cloneDeep(inputs))
    this._started = false
    this._completed = false
    this._outcome = Outcome.create()
  }

  static create (rawInputs) {
    return doNotAllowMissingProperties(new this(rawInputs))
  }

  static run (rawInputs) {
    const command = this.create(rawInputs)
    return command.run()
  }

  static runAndAssertSuccess (rawInputs) {
    const command = this.create(rawInputs)
    return command.runAndAssertSuccess()
  }

  async run () {
    if (this._started) { throw new Error('Cannot run a command twice') }

    try {
      this._started = true

      this.validateInputs()
      this.applyDefaultInputs()
      await this._validate()
      const result = await this.execute()
      this.setResult(result)
    } catch (err) {
      if (err !== HaltExecution) {
        this.addUnknownError(err.message)
        throw err
      }
    } finally {
      this._completed = true
    }

    return this.outcome
  }

  async runAndAssertSuccess () {
    await this.run()

    if (this.outcome.success) {
      return this.outcome.result
    }
    throw new Error(this.outcome.errorSentence)
  }

  async _validate () {
    await this.validate()
    this.haltIfHasErrors()
  }

  async validate () { } // override for custom validation

  get outcome () {
    if (!this._completed) {
      throw new Error('Cannot access the outcome of a command that has not been run')
    }
    return this._outcome
  }

  // Methods deletgated to _outcome. Is there a helper to make this type of delegation less verbose?
  // note: using _outcome and protecting the outcome getter so that an outcome is not accessible
  //       by the caller without actually running the command.
  get runtimeErrors () { return this.outcome.runtimeErrors }
  get inputErrors () { return this.outcome.inputErrors }
  get hasErrors () { return this._outcome.hasErrors }
  addInputError (input, errorKey, message) { return this._outcome.addInputError(input, errorKey, message) }
  addRuntimeError (errorKey, message) {
    this._outcome.addRuntimeError(errorKey, message)
    this.halt()
  }

  addUnknownError (message) { return this._outcome.addUnknownError(message) }
  setResult (result) { return this._outcome.setResult(result) }

  validateInputs () {
    this.validateSupportedInputs()
    this.validateBlankInputs()
    this.validateRequiredInputs()
    this.validateEnums()
    // TODO: implement validateTypes()

    this.haltIfHasErrors()
  }

  validateSupportedInputs () {
    const allowedInputs = Object.keys(this.schema)

    for (const inputName in this.inputs) {
      if (!allowedInputs.includes(inputName)) {
        this.addInputError(inputName, this.errorTypes.UNSUPPORTED, inputName + ' is not a supported input')
      }
    }
  }

  validateBlankInputs () {
    for (const inputName in this.inputs) {
      const inputSchema = this.schema[inputName]

      if (inputSchema) {
        const inputValue = this.inputs[inputName]
        if (isBlank(inputValue) && !inputSchema.allowBlank) {
          this.addInputError(inputName, this.errorTypes.BLANK, inputName + ' is not allowed to be blank')
        }
      }
    }
  }

  validateRequiredInputs () {
    for (const inputName in this.schema) {
      const inputSchema = this.schema[inputName]
      const required = inputSchema.required

      if (!(inputName in this.inputs)) {
        if (required) {
          this.addInputError(inputName, this.errorTypes.MISSING, inputName + ' is missing')
        }
      }
    }
  }

  applyDefaultInputs () {
    for (const inputName in this.schema) {
      const inputSchema = this.schema[inputName]

      if (!(inputName in this.inputs)) {
        allowMissingProperties(this.inputs)[inputName] = ('default' in inputSchema) ? inputSchema.default : undefined
      }
    }
  }

  validateEnums () {
    for (const inputName in this.schema) {
      const inputSchema = this.schema[inputName]
      const type = inputSchema.type

      if (type === 'enum' && inputName in this.inputs) {
        const oneOf = Object.values(inputSchema.oneOf)
        const value = this.inputs[inputName]

        if (value !== undefined && !oneOf.includes(value)) {
          this.addInputError(inputName, this.errorTypes.INVALID, value + ' received but must be one of ' + oneOf.join(', '))
        }
      }
    }
  }

  get errorTypes () {
    return this._outcome.errorTypes
  }

  async runSubCommand (CommandClass, inputs, assertSuccess = true) {
    const command = new CommandClass(inputs)
    const outcome = await command.run()

    if (!outcome.success) {
      this.copyErrors(command)

      if (assertSuccess) {
        this.halt()
      }
    }

    return assertSuccess ? outcome.result : outcome
  }

  copyErrors (subCommand) {
    const subErrors = subCommand.outcome.errors
    const subName = subCommand.constructor.name

    for (const category in subErrors) {
      const errorKeysAndMessages = subErrors[category]

      errorKeysAndMessages.forEach((pair) => {
        const key = subName + ':' + pair[0]
        const message = pair[1]
        this.addInputError(category, key, message)
      })
    }
  }

  haltIfHasErrors () {
    if (this.hasErrors) {
      this.halt()
    }
  }

  halt () {
    throw HaltExecution
  }
}

const Outcome = class {
  _result
  _errors

  static create () {
    return doNotAllowMissingProperties(new this())
  }

  constructor () {
    this._result = null
    this._errors = {}
  }

  get result () { return this._result }
  get errors () { return this._errors }
  get runtimeErrors () { return this.errors.runtime }
  get inputErrors () {
    const e = Object.assign({}, this.errors)
    delete e.runtime
    return e
  }

  get success () {
    return !this.hasErrors
  }

  static errorTypes = doNotAllowMissingProperties({
    NOT_FOUND: 'not_found',
    INVALID: 'invalid',
    MISSING: 'missing',
    BLANK: 'blank',
    UNSUPPORTED: 'unsupported',
    RUNTIME: 'runtime',
    TYPE_MISMATCH: 'type_mismatch',
    UNKNOWN: 'unknown'
  })

  get errorTypes () {
    return Outcome.errorTypes
  }

  get hasErrors () {
    return !isEmpty(this.errors)
  }

  addInputError (input, errorKey, message) {
    if (!(input in this.errors)) {
      this.errors[input] = []
    }

    this.errors[input].push([errorKey, message])
  }

  addRuntimeError (errorKey, message) {
    this.addInputError(this.errorTypes.RUNTIME, errorKey, message)
  }

  addUnknownError (message) {
    this.addInputError(this.errorTypes.RUNTIME, this.errorTypes.UNKNOWN, message)
  }

  setResult (result) {
    this._result = result
  }

  get symbolicErrors () {
    return reduce(this.errors, (result, errors, input) => {
      const symbolic = map(errors, (error) => error[0])
      result[input] = symbolic
      return result
    }, {})
  }

  get englishErrors () {
    return reduce(this.errors, (result, errors, input) => {
      const english = map(errors, (error) => error[1])
      result[input] = english
      return result
    }, {})
  }

  get errorSentence () {
    return Object.values(this.englishErrors).flat().join(', and ') + '.'
  }

  get notFoundError () {
    const symbols = Object.values(this.symbolicErrors).flat()
    return symbols.includes(this.errorTypes.NOT_FOUND)
  }
}

const isBlankString = (value) => isString(value) && !!value.match(/^\s*$/) // no \A or \z in JavaScript??
const isEmptyArray = (value) => isArray(value) && isEmpty(value)
const isEmptyObject = (value) => isObject(value) && isEmpty(value)

const isBlank = (value) => {
  return isNull(value) || isUndefined(value) || isBlankString(value) || isEmptyArray(value) || isEmptyObject(value) || isNaN(value)
}

module.exports = {
  Command
}
