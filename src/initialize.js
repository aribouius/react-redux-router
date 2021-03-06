import match from './match'
import { push } from './actions'

export default async ({
  store,
  location,
  ...options
}) => {
  if (!store) {
    throw new Error('Expected to receive a redux store.')
  }
  return match({
    dispatch: store.dispatch,
    location: store.dispatch(push(location)).location,
    ...options,
  })
}
