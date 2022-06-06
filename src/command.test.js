
const { describe, it, expect, beforeEach } = require('@jest/globals')
const { jest: { clearAllMocks, spyOn } } = require('@jest/globals')

const { Command } = require('./command')

describe('Command', () => {
  beforeEach(() => { clearAllMocks() })

  describe('with empty schema', () => {
    describe('explicit version', () => {
      describe('static run', () => {
        class TestCommand extends Command {
          schema = {}

          execute () {
            return 'We made it!'
          }
        }
        it.only('executes successfully', async () => {
          const outcome = await TestCommand.run()
          expect(outcome.success).toBe(true)
          expect(outcome.result).toBe('We made it!')
        })
      })
    })

    describe('implicit version', () => {
      describe('static run', () => {
        class TestCommand extends Command {
          execute () {
            return 'We made it!'
          }
        }
        it.only('executes successfully', async () => {
          const outcome = await TestCommand.run()
          expect(outcome.success).toBe(true)
          expect(outcome.result).toBe('We made it!')
        })
      })
    })
  })

  describe('command with inputs', () => {
    class TestCommand extends Command {
      // TODO: This will be static later, will be addressed in other PR.
      schema =
        {
          input1: { type: 'string', required: true },
          input2: { type: 'string', default: 'default input2' }
        }

      execute () {
        return this.inputs.input1
      }

      validate () {
        if (this.inputs.input1 === 'invalid input1') {
          this.addInputError('input1', 'invalid', 'invalid value!')
        }
      }
    }

    describe('run', () => {
      it('Is successful', async () => {
        const outcome = await TestCommand.run({ input1: 'This just works' })
        expect(outcome.success).toBe(true)
        expect(outcome.result).toBe('This just works')
      })

      describe('required input missing', () => {
        it('Is not successful', async () => {
          const outcome = await TestCommand.run()
          expect(outcome.success).toBe(false)
          expect(outcome.result).toBeNull()
          expect(outcome.errors.input1[0][0]).toEqual('missing')
        })
      })
      describe('manually adding an input error', () => {
        it('Is not successful', async () => {
          const outcome = await TestCommand.run({ input1: 'invalid input1' })
          expect(outcome.success).toBe(false)
          expect(outcome.result).toBeNull()
          expect(outcome.errors.input1[0][0]).toEqual('invalid')
        })
      })
      describe('runtime error', () => {
        class AnotherTestCommand extends TestCommand {
          execute () {
            this.operation1()
            this.operation2()
            this.operation3()
          }

          operation1 () {
            return 'operation 1 ok'
          }

          operation2 () {
            this.addRuntimeError('operation 2 exploded!')
          }

          operation3 () {
            return 'operation 3 ok'
          }
        }

        beforeEach(() => {
          spyOn(AnotherTestCommand.prototype, 'operation1')
          spyOn(AnotherTestCommand.prototype, 'operation2')
          spyOn(AnotherTestCommand.prototype, 'operation3')
        })

        it('it halts execution', async () => {
          const outcome = await AnotherTestCommand.run({ input1: 'nice!' })
          expect(outcome.success).toBe(false)
          expect(outcome.result).toBeNull()
          expect(outcome.errors.runtime[0][0]).toEqual('operation 2 exploded!')
          expect(AnotherTestCommand.prototype.operation1).toHaveBeenCalled()
          expect(AnotherTestCommand.prototype.operation2).toHaveBeenCalled()
          expect(AnotherTestCommand.prototype.operation3).not.toHaveBeenCalled()
        })
      })
    })

    describe('runAndAssertSuccess', () => {
      it('Is successful', async () => {
        const result = await TestCommand.runAndAssertSuccess({ input1: 'This just works' })
        expect(result).toBe('This just works')
      })

      describe('required input missing', () => {
        it('Is not successful', async () => {
          expect(async () => await TestCommand.runAndAssertSuccess()).rejects.toThrow('input1 is missing.')
        })
      })
      describe('manually adding an input error', () => {
        it('Is not successful', async () => {
          expect(async () => await TestCommand.runAndAssertSuccess({ input1: 'invalid input1' })).rejects.toThrow('invalid value!.')
        })
      })
    })

    describe('run instance method', () => {
      it('Is successful', async () => {
        const command = new TestCommand({ input1: 'This just works' })
        const outcome = await command.run()
        expect(outcome.success).toBe(true)
        expect(outcome.result).toBe('This just works')
      })
      describe('default values', () => {
        it('Is successful', async () => {
          const command = TestCommand.create({ input1: 'This just works' })
          await command.run()
          expect(command.success).toBe(true)
          expect(command.inputs.input2).toEqual('default input2')
          expect(command.result).toBe('This just works')
        })
      })
    })
  })
})
