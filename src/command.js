const { isEmpty, isObject, isArray, isString, reduce, map, isNull, isUndefined } = require('lodash')
const doNotAllowMissingProperties = require('./doNotAllowMissingProperties')

const HaltExecution = class extends Error {}

const Command = class {
  #rawInputs
  #inputs
  #outcome
  #started
  #completed

  constructor (inputs) {
    this.#rawInputs = inputs
    this.#inputs = doNotAllowMissingProperties(inputs)
    this.#started = false
    this.#completed = false
    this.#outcome = new Outcome()
  }

  static run (rawInputs) {
    const command = new this(rawInputs)
    return command.run()
  }

  static runAndAssertSuccess (rawInputs) {
    const command = new this(rawInputs)
    return command.runAndAssertSuccess()
  }

  async run () {
    if (this.started) { throw new Error('Cannot run a command twice') }

    this.#started = true

    let result = null

    if (!this.hasErrors) { this.validateInputs() }
    this.applyDefaultInputs()
    if (!this.hasErrors) { await this.validate() }
    if (!this.hasErrors) {
      try {
        result = await this.execute()
      } catch (err) {
        if (err.constructor !== HaltExecution) {
          throw err
        }
      }
    }
    if (!this.hasErrors) { this.#outcome.setResult(result) }

    this.#completed = true

    return this.outcome
  }

  async runAndAssertSuccess () {
    await this.run()

    if (this.outcome.success) {
      return this.outcome.result
    }
    throw new Error(this.outcome.errorSentence)
  }

  async validate () {}

  get schema () { return this.constructor.schema }

  get outcome () {
    if (!this.completed) {
      throw new Error('Cannot access the outcome of a command that has not been run')
    }
    return this.#outcome
  }

  get success () {
    if (!this.completed) {
      throw new Error('Cannot check the success status of a command that has not been run')
    }
    return this.#outcome.success
  }

  get rawInputs () { return this.#rawInputs }
  get inputs () { return this.#inputs }
  get started () { return this.#started }
  get completed () { return this.#completed }
  // Methods deletgated to #outcome. Is there a helper to make this type of delegation less verbose?
  // note: using #outcome and protecting the outcome getter so that an outcome is not accessible
  //       by the caller without actually running the command.
  get result () { return this.#outcome.result }
  get errors () { return this.#outcome.errors }
  get runtimeErrors () { return this.#outcome.runtimeErrors }
  get inputErrors () { return this.#outcome.inputErrors }
  get hasErrors () { return this.#outcome.hasErrors }
  addInputError (input, errorKey, message) { return this.#outcome.addInputError(input, errorKey, message) }
  addRuntimeError (errorKey, message) {
    this.#outcome.addRuntimeError(errorKey, message)
    throw new HaltExecution()
  }

  validateInputs () {
    this.validateSupportedInputs()
    this.validateBlankInputs()
    this.validateRequiredInputs()
    this.validateEnums()
    // TODO: implement validateTypes()
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
        this.inputs[inputName] = ('default' in inputSchema) ? inputSchema.default : undefined
      }
    }
  }

  validateEnums () {
    for (const inputName in this.schema) {
      const inputSchema = this.schema[inputName]
      const type = inputSchema.type

      if (type === 'enum') {
        const oneOf = Object.values(inputSchema.oneOf)
        const value = this.inputs[inputName]

        if (!oneOf.includes(value)) {
          this.addInputError(inputName, this.errorTypes.INVALID, value + ' received but must be one of ' + oneOf.join(', '))
        }
      }
    }
  }

  get errorTypes () {
    return this.#outcome.errorTypes
  }

  async runSubCommand (CommandClass, inputs) {
    const command = new CommandClass(inputs)
    const outcome = await command.run()

    if (!outcome.success) {
      this.copyErrors(command)
    }

    return outcome
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
}

const Outcome = class {
  #result
  #errors

  constructor () {
    this.#result = null
    this.#errors = {}
  }

  get result () { return this.#result }
  get errors () { return this.#errors }
  get runtimeErrors () { return this.errors.runtime }
  get inputErrors () {
    const e = Object.assign({}, this.errors)
    delete e.runtime
    return e
  }

  get success () {
    return !this.hasErrors
  }

  static errorTypes = {
    NOT_FOUND: 'not found',
    INVALID: 'invalid',
    MISSING: 'missing',
    BLANK: 'blank',
    UNSUPPORTED: 'unsupported',
    RUNTIME: 'runtime'
  }

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

  setResult (result) {
    this.#result = result
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
  return isNull(value) || isUndefined(value) || isBlankString(value) || isEmptyArray(value) || isEmptyObject(value)
}

module.exports = {
  Command
}
