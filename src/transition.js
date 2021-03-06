import { matchRoutes } from 'little-router'
import { changeRoute, renderRoute } from './actions'
import { isFunc, isPromise, sanitize } from './utils'
import { STATUS_OK, STATUS_NOT_FOUND } from './const'

export default async (options = {}) => {
  const {
    strict,
    routes = [],
    location = {},
    dispatch,
    beforeRender,
  } = options

  const route = {}
  const params = {}
  const actions = []
  const resolvers = {}
  const components = {}

  let promises
  let sanitized

  // match route branches
  const branches = matchRoutes({
    path: location.pathname || '',
    routes,
    strict,
  })

  // reduce route object while extracting
  // actions, resolvers, and components
  branches.forEach((branch, index) => {
    const { route: { action, resolve, component, ...rest } } = branch

    Object.assign(route, rest)
    Object.assign(params, branch.params)

    if (action) {
      actions.push(action)
    }
    if (resolve) {
      resolvers[index] = resolve
    }
    if (component) {
      components[index] = component
    }
  })

  // toggle loading flag
  route.loading = true

  // ensure route has a status code
  if (!route.status) {
    route.status = branches.length ? STATUS_OK : STATUS_NOT_FOUND
  }

  // these are serializable but we don't want
  // them added to the state or passed down
  delete route.routes

  // prepare route object for dispatch
  sanitized = sanitize(route)

  // create container for middleware updates
  const transition = {}

  // dispatch route change action
  if (dispatch) {
    dispatch(changeRoute({
      route: sanitized,
      params,
      location,
      transition,
    }))
  }

  // resolve routes with async properties
  promises = []
  Object.keys(resolvers).forEach(index => {
    const resolver = resolvers[index]
    const response = Promise.resolve(resolver({ route, params, location }))
    promises.push(response.then(({
      action,
      component,
      ...props
    } = {}) => {
      Object.assign(route, props)
      if (action) {
        actions.push(action)
      }
      if (component) {
        components[index] = component
      }
    }))
  })

  if (promises.length) {
    await Promise.all(promises)
  }

  // dispatch route actions
  if (dispatch) {
    promises = []
    actions.forEach(action => {
      if (isFunc(action)) {
        const promise = dispatch(action({ route, params, location }))
        if (isPromise(promise)) {
          promises.push(promise)
        }
      } else {
        dispatch(action)
      }
    })
    if (promises.length) {
      await Promise.all(promises)
    }
  }

  // exit if transition was invalidated
  // by a route action
  if (transition.invalid) {
    return undefined
  }

  // toggle loading flag
  route.loading = false

  // sort components into proper order before
  // adding back to route
  route.components = Object.keys(components).sort().map(key => (
    components[key]
  ))

  // define a result object since
  // we need it twice below
  const result = {
    route,
    routes,
    strict,
    params,
    location,
  }

  // this callback is useful for ensuring
  // custom actions get dispatched in the
  // same render cycle that gets triggered by
  // the actions being triggered in this file
  if (isFunc(beforeRender)) {
    beforeRender(result)
  }

  // exit if transition was invalidated
  // by beforeRender callback
  if (transition.invalid) {
    return undefined
  }

  // update local route status code if a status change
  // was dispatched in route action or beforeRender
  if (transition.status) {
    route.status = transition.status
  }

  // prepare route object for dispatch
  sanitized = sanitize(route)

  // we don't want these in the state
  delete sanitized.components

  // dispatch render route action
  if (dispatch) {
    dispatch(renderRoute({
      route: sanitized,
      params,
      location,
    }))
  }

  return result
}
