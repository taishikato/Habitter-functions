import * as functions from 'firebase-functions'
import * as admin from 'firebase-admin'
import * as logger from 'firebase-functions/lib/logger'
import * as dayjs from 'dayjs'
import * as utc from 'dayjs/plugin/utc'
import * as timezone from 'dayjs/plugin/timezone'

dayjs.extend(utc)
dayjs.extend(timezone)

admin.initializeApp()
const db = admin.firestore()

const defaultTimezone = 'America/Los_Angeles'

type User = {
  timezone?: string
  fcmToken?: string
}

type Todo2Push = {
  userId: string
  todoName: string
  fcmToken: string
}

exports.sendPushnotifications = functions.pubsub.schedule('* * * * *').onRun(async (context) => {
  // get the present timestamp
  const timestamp = Math.floor(Date.now() / 1000)

  const todo2Push: Todo2Push[] = []

  // fetch habits
  const habitsSnapshot = await db.collection('habits').get()
  for (const habitData of habitsSnapshot.docs) {
    // get the habit data
    const habit = habitData.data()
    const habitId = habitData.id

    // get the habit's owner
    const userData = await db.collection('users').doc(habit.userId).get()
    const user = userData.data() as User

    const { fcmToken } = user
    if (!fcmToken) {
      logger.info('The user does not have a fcm token, thus the proces is done.')
      return
    }

    // format to HH:mm
    const presentTime = dayjs
      .unix(timestamp)
      .tz(user?.timezone || defaultTimezone)
      .format('HH:mm')

    logger.info(`Time: ${presentTime}, Timezone: ${user.timezone}`)

    const todosSnapshot = await db.collection('habits').doc(habitId).collection('todos').get()
    todosSnapshot.docs.forEach((todoData) => {
      const todo = todoData.data()
      if (todo.doTime === presentTime) {
        todo2Push.push({
          userId: habit.userId,
          todoName: todo.name,
          fcmToken,
        })
      }
    })
  }

  if (todo2Push.length === 0) {
    logger.info('No data. The process is done and not send a push notification.')
    return
  }

  for (const todo of todo2Push) {
    const payload = {
      token: todo?.fcmToken,
      notification: {
        title: todo.todoName,
        body: 'wooq',
      },
    }

    try {
      await admin.messaging().send(payload)
    } catch (err) {
      logger.error((err as any).message)
    }
  }
})
