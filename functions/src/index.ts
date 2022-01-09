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

exports.sendPushnotifications = functions.pubsub.schedule('* * * * *').onRun(async (context) => {
  // get the present timestamp
  const timestamp = Math.floor(Date.now() / 1000)
  // format to HH:mm
  const presentTime = dayjs.unix(timestamp).tz('Asia/Tokyo').format('HH:mm')

  logger.info('Time', presentTime)

  const todo2Push: any[] = []

  // fetch todos
  const habitsSnapshot = await db.collection('habits').get()
  for (const habitData of habitsSnapshot.docs) {
    const habit = habitData.data()
    const habitId = habitData.id

    const todosSnapshot = await db.collection('habits').doc(habitId).collection('todos').get()
    todosSnapshot.docs.forEach((todoData) => {
      const todo = todoData.data()
      if (todo.doTime === presentTime) {
        todo2Push.push({
          userId: habit.userId,
          name: todo.name,
        })
      }
    })
  }

  if (todo2Push.length === 0) {
    logger.info('INFO no data to send a push notification')
    return
  }

  for (const todo of todo2Push) {
    const userData = await db.collection('users').doc(todo.userId).get()
    const user = userData.data()
    const payload = {
      token: user?.fcmToken,
      notification: {
        title: todo.name,
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
