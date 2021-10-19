const { isEmpty, isBlank, reduce, map } = require('lodash')
const doNotAllowMissingProperties = require('./doNotAllowMissingProperties')

const Command = class {
  static useTransactionalExecute = false

  #inputs
  #outcome
  #started
  #completed

  constructor (inputs) {
    this.#inputs = doNotAllowMissingProperties(inputs)
    this.#started = false
    this.#completed = false
    this.#outcome = new Outcome()
  }

  static run (rawInputs) {
    const command = new this(rawInputs)
    return command.run()
  }

  async run () {
    if (this.started) { throw new Error('Cannot run a command twice') }

    this.#started = true

    let result = null

    if (!this.hasErrors) { this.validateInputs() }
    if (!this.hasErrors) { await this.validate() }
    if (!this.hasErrors) {
      if (this.constructor.useTransactionalExecute) {
        result = await config.transaction(() => this.execute())
      } else {
        result = await this.execute()
      }
    }
    if (!this.hasErrors) { this.#outcome.setResult(result) }

    this.#completed = true

    return this.outcome
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

  // Methods deletgated to #outcome. Is there a helper to make this type of delegation less verbose?
  // note: using #outcome and protecting the outcome getter so that an outcome is not accessible
  //       by the caller without actually running the command.
  get inputs () { return this.#inputs }
  get started () { return this.#started }
  get completed () { return this.#completed }
  get result () { return this.#outcome.result }
  get errors () { return this.#outcome.errors }
  get runtimeErrors () { return this.#outcome.runtimeErrors }
  get inputErrors () { return this.#outcome.inputErrors }
  get hasErrors () { return this.#outcome.hasErrors }
  addInputError (input, errorKey, message) { return this.#outcome.addInputError(input, errorKey, message) }
  addRuntimeError (errorKey, message) { return this.#outcome.addRuntimeError(errorKey, message) }

  validateInputs () {
    this.validateSupportedInputs()
    this.validateBlankInputs()
    this.validateRequiredInputs()
    this.validateEnums()
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
    for (const [inputName, inputValue] in Object.entries(this.inputs)) {
      const inputSchema = this.schema[inputName]

      if (inputSchema) {
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

      if (required && !(inputName in this.inputs)) {
        this.addInputError(inputName, this.errorTypes.MISSING, inputName + ' is missing')
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

  runSubCommand (commandClass, inputs) {
    const subCommand = commandClass.run(inputs)

    if (!subCommand.success) {
      this.copyErrors(subCommand)
    }

    return subCommand
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

const config = {
  transaction: (fn) => {
    throw new Error('You must set config.transaction with a transaction provider to use this feature')
  }
}

module.exports = {
  Command,
  config
}
