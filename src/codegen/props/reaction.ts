import { fmtPct } from '../utils/fmtPct'

interface KeyframeData {
  [percentage: string]: Record<string, unknown>
}

interface AnimationStep {
  node: SceneNode
  duration: number
  easing: { type: string } | undefined
  delay: number
}

interface AnimationChainResult {
  chain: AnimationStep[]
  isLoop: boolean
}

// Store animation data for children nodes by parent node ID
const childAnimationCache = new Map<
  string,
  Map<string, Record<string, unknown>>
>()

// Format duration/delay values (up to 3 decimal places, remove trailing zeros)
function fmtDuration(n: number): string {
  return (Math.round(n * 1000) / 1000)
    .toFixed(3)
    .replace(/\.000$/, '')
    .replace(/(\.\d*?)0+$/, '$1')
    .replace(/\.$/, '')
}

export async function getReactionProps(
  node: SceneNode,
): Promise<Record<string, unknown>> {
  // Check if this node is a child that should have animation props
  const parentAnimations = childAnimationCache.get(node.parent?.id || '')
  if (parentAnimations) {
    const childProps = parentAnimations.get(node.name)
    if (childProps) {
      return childProps
    }
  }

  // If this node has reactions, build animations for its children
  if (
    !('reactions' in node) ||
    !node.reactions ||
    node.reactions.length === 0
  ) {
    return {}
  }

  // Find SMART_ANIMATE transitions from reactions array
  for (const reaction of node.reactions) {
    const actions = reaction.actions || []

    for (const action of actions) {
      // Check for SMART_ANIMATE transition
      if (
        action.type === 'NODE' &&
        action.transition?.type === 'SMART_ANIMATE'
      ) {
        const transition = action.transition
        const trigger = reaction.trigger

        // Generate keyframes for timer-based animations
        if (trigger?.type === 'AFTER_TIMEOUT') {
          const timeout = trigger.timeout || 0
          const destinationId = action.destinationId

          // Get destination node
          if (destinationId) {
            try {
              const destinationNode =
                await figma.getNodeByIdAsync(destinationId)

              // Check if node is a SceneNode (not DocumentNode or PageNode)
              if (
                destinationNode &&
                'type' in destinationNode &&
                destinationNode.type !== 'DOCUMENT' &&
                destinationNode.type !== 'PAGE'
              ) {
                // Build animation chain by following reactions
                const { chain: animationChain, isLoop } =
                  await buildAnimationChain(
                    node,
                    destinationNode as SceneNode,
                    transition.duration || 0.3,
                    transition.easing,
                    timeout,
                  )

                if (animationChain.length > 0) {
                  // Generate animations for each child
                  const childAnimations = await generateChildAnimations(
                    node,
                    animationChain,
                    isLoop,
                  )

                  // Store in cache for children to access
                  if (childAnimations.size > 0) {
                    childAnimationCache.set(node.id, childAnimations)
                  } else {
                    // Fallback: if node has no children, apply animation to node itself
                    const totalDuration = animationChain.reduce(
                      (sum, step) => sum + step.duration,
                      0,
                    )
                    const firstStep = animationChain[0]
                    const firstEasing = firstStep.easing || { type: 'LINEAR' }

                    // Build simple keyframes for the node itself
                    const keyframes: KeyframeData = {}

                    // First pass: collect all changes to know which properties animate
                    const allChanges: Record<string, unknown>[] = []
                    for (let i = 0; i < animationChain.length; i++) {
                      const step = animationChain[i]
                      const prevNode =
                        i === 0 ? node : animationChain[i - 1].node
                      const changes = await generateSingleNodeDifferences(
                        prevNode,
                        step.node,
                      )
                      allChanges.push(changes)
                    }

                    // Find all properties that change during animation
                    const animatedProperties = new Set<string>()
                    for (const changes of allChanges) {
                      for (const key of Object.keys(changes)) {
                        animatedProperties.add(key)
                      }
                    }

                    // Get initial values for animated properties from the START node
                    // Only include properties that have different values across frames
                    const initialValues: Record<string, unknown> = {}
                    if (allChanges.length > 0 && animatedProperties.size > 0) {
                      // For each property, check if it has different values
                      const propertyNeedsInitial = new Map<string, boolean>()
                      for (const key of animatedProperties) {
                        const values = new Set<string>()
                        for (const changes of allChanges) {
                          if (changes[key] !== undefined) {
                            values.add(JSON.stringify(changes[key]))
                          }
                        }
                        // Only include in 0% if property has multiple different values
                        propertyNeedsInitial.set(key, values.size > 1)
                      }

                      // Get the starting values by comparing first destination back to source
                      // This gives us the values from the source node in the same format
                      const firstStep = animationChain[0]
                      const startingValues =
                        await generateSingleNodeDifferences(
                          firstStep.node,
                          node,
                        )

                      // For each animated property, use the starting value only if it has multiple different values
                      for (const key of animatedProperties) {
                        if (
                          propertyNeedsInitial.get(key) &&
                          startingValues[key] !== undefined
                        ) {
                          initialValues[key] = startingValues[key]
                        }
                      }
                    }

                    // Set initial keyframe with animated properties
                    keyframes['0%'] = initialValues

                    // Determine which properties should be included
                    // Exclude properties that appear multiple times with the same value
                    const propertyHasMultipleValues = new Map<string, boolean>()
                    for (const key of animatedProperties) {
                      const values = new Set<string>()
                      let occurrenceCount = 0
                      for (const changes of allChanges) {
                        if (changes[key] !== undefined) {
                          values.add(JSON.stringify(changes[key]))
                          occurrenceCount++
                        }
                      }
                      // Include if: property has multiple different values OR appears only once
                      propertyHasMultipleValues.set(
                        key,
                        values.size > 1 || occurrenceCount === 1,
                      )
                    }

                    // Second pass: build keyframes with incremental changes
                    let accumulatedTime = 0
                    let previousKeyframe: Record<string, unknown> = {
                      ...initialValues,
                    }
                    for (let i = 0; i < animationChain.length; i++) {
                      const step = animationChain[i]
                      accumulatedTime += step.duration

                      const percentage = Math.round(
                        (accumulatedTime / totalDuration) * 100,
                      )
                      const percentageKey = `${percentage}%`

                      const changes = allChanges[i]

                      // Only include properties that changed from previous keyframe AND have multiple values
                      const incrementalChanges: Record<string, unknown> = {}
                      for (const [key, value] of Object.entries(changes)) {
                        if (
                          propertyHasMultipleValues.get(key) &&
                          previousKeyframe[key] !== value
                        ) {
                          incrementalChanges[key] = value
                        }
                      }

                      if (Object.keys(incrementalChanges).length > 0) {
                        keyframes[percentageKey] = incrementalChanges
                        previousKeyframe = {
                          ...previousKeyframe,
                          ...incrementalChanges,
                        }
                      }
                    }

                    if (Object.keys(keyframes).length > 1) {
                      const props: Record<string, string> = {
                        animationName: `keyframes(${JSON.stringify(keyframes)})`,
                        animationDuration: `${fmtDuration(totalDuration)}s`,
                        animationTimingFunction: getEasingFunction(firstEasing),
                        animationFillMode: 'forwards',
                      }

                      // Only add delay if it's significant (>= 0.01s / 10ms)
                      if (timeout >= 0.01) {
                        props.animationDelay = `${fmtDuration(timeout)}s`
                      }

                      // Add infinite iteration if it's a loop
                      if (isLoop) {
                        props.animationIterationCount = 'infinite'
                      }

                      return props
                    }
                  }
                }
              }
            } catch (e) {
              console.error('Failed to get destination node:', e)
            }
          }
        }
      }
    }
  }

  return {}
}

async function buildAnimationChain(
  startNode: SceneNode,
  currentNode: SceneNode,
  duration: number,
  easing: { type: string } | undefined,
  delay: number,
  visitedIds: Set<string> = new Set(),
): Promise<AnimationChainResult> {
  const chain: AnimationStep[] = []
  const currentNodeId = currentNode.id
  let isLoop = false

  // Prevent infinite loops by checking if we've visited this node
  if (visitedIds.has(currentNodeId)) {
    return { chain, isLoop: false }
  }

  // Check for circular reference back to start node (this means it's a loop!)
  if (currentNodeId === startNode.id) {
    return { chain, isLoop: true }
  }

  visitedIds.add(currentNodeId)

  // Add current step to chain
  chain.push({
    node: currentNode,
    duration,
    easing,
    delay,
  })

  // Check if current node has further reactions
  if ('reactions' in currentNode && currentNode.reactions) {
    for (const reaction of currentNode.reactions) {
      const actions = reaction.actions || []

      for (const action of actions) {
        if (
          action.type === 'NODE' &&
          action.transition?.type === 'SMART_ANIMATE' &&
          reaction.trigger?.type === 'AFTER_TIMEOUT'
        ) {
          const nextDestinationId = action.destinationId

          if (nextDestinationId) {
            // Check if next destination loops back to start
            if (nextDestinationId === startNode.id) {
              isLoop = true
              break
            }

            if (!visitedIds.has(nextDestinationId)) {
              try {
                const nextNode = await figma.getNodeByIdAsync(nextDestinationId)

                if (
                  nextNode &&
                  'type' in nextNode &&
                  nextNode.type !== 'DOCUMENT' &&
                  nextNode.type !== 'PAGE'
                ) {
                  // Recursively build chain
                  const result = await buildAnimationChain(
                    startNode,
                    nextNode as SceneNode,
                    action.transition.duration || 0.3,
                    action.transition.easing,
                    reaction.trigger.timeout || 0,
                    new Set(visitedIds),
                  )

                  chain.push(...result.chain)
                  if (result.isLoop) {
                    isLoop = true
                  }
                }
              } catch (e) {
                console.error('Failed to get next node in chain:', e)
              }
            }
          }
        }
      }
    }
  }

  return { chain, isLoop }
}

async function generateChildAnimations(
  startNode: SceneNode,
  chain: AnimationStep[],
  isLoop: boolean,
): Promise<Map<string, Record<string, unknown>>> {
  const childAnimationsMap = new Map<string, Record<string, unknown>>()

  if (chain.length === 0) return childAnimationsMap

  const totalDuration = chain.reduce((sum, step) => sum + step.duration, 0)
  const firstStep = chain[0]

  // Get children from start node and destination nodes
  if (!('children' in startNode)) return childAnimationsMap

  const startChildren = startNode.children as readonly SceneNode[]
  const childrenByName = new Map<string, SceneNode>()

  startChildren.forEach((child) => {
    childrenByName.set(child.name, child)
  })

  // For each child, build its individual keyframes across the animation chain
  for (const [childName] of childrenByName) {
    const keyframes: KeyframeData = {}

    let accumulatedTime = 0
    let hasChanges = false

    // First pass: collect all changes to know which properties animate
    const allChanges: Record<string, unknown>[] = []
    for (let i = 0; i < chain.length; i++) {
      const step = chain[i]
      const prevNode = i === 0 ? startNode : chain[i - 1].node
      const currentNode = step.node

      // Find matching child in current step by name
      if ('children' in prevNode && 'children' in currentNode) {
        const prevChildren = prevNode.children as readonly SceneNode[]
        const currentChildren = currentNode.children as readonly SceneNode[]

        const prevChild = prevChildren.find((c) => c.name === childName)
        const currentChild = currentChildren.find((c) => c.name === childName)

        if (prevChild && currentChild) {
          const changes = await generateSingleNodeDifferences(
            prevChild,
            currentChild,
          )
          allChanges.push(changes)
        } else {
          allChanges.push({})
        }
      } else {
        allChanges.push({})
      }
    }

    // Find all properties that change during animation
    const animatedProperties = new Set<string>()
    for (const changes of allChanges) {
      for (const key of Object.keys(changes)) {
        animatedProperties.add(key)
      }
    }

    // Get initial values for animated properties from the START state
    // Only include properties that have different values across frames
    const initialValues: Record<string, unknown> = {}
    if (allChanges.length > 0 && animatedProperties.size > 0) {
      // For each property, check if it has different values
      const propertyNeedsInitial = new Map<string, boolean>()
      for (const key of animatedProperties) {
        const values = new Set<string>()
        for (const changes of allChanges) {
          if (changes[key] !== undefined) {
            values.add(JSON.stringify(changes[key]))
          }
        }
        // Only include in 0% if property has multiple different values
        propertyNeedsInitial.set(key, values.size > 1)
      }

      // Get the starting child from startNode
      const startChild = startChildren.find((c) => c.name === childName)

      if (startChild) {
        // Get the first step's matching child
        const firstStep = chain[0]
        if ('children' in firstStep.node) {
          const firstChildren = firstStep.node.children as readonly SceneNode[]
          const firstChild = firstChildren.find((c) => c.name === childName)

          if (firstChild) {
            // Compare first destination back to source to get starting values
            const startingValues = await generateSingleNodeDifferences(
              firstChild,
              startChild,
            )

            // For each animated property, use the starting value only if it has multiple different values
            for (const key of animatedProperties) {
              if (
                propertyNeedsInitial.get(key) &&
                startingValues[key] !== undefined
              ) {
                initialValues[key] = startingValues[key]
              }
            }
          }
        }
      }
    }

    // Set initial keyframe with animated properties
    keyframes['0%'] = initialValues

    // Determine which properties should be included
    // Exclude properties that appear multiple times with the same value
    const propertyHasMultipleValues = new Map<string, boolean>()
    for (const key of animatedProperties) {
      const values = new Set<string>()
      let occurrenceCount = 0
      for (const changes of allChanges) {
        if (changes[key] !== undefined) {
          values.add(JSON.stringify(changes[key]))
          occurrenceCount++
        }
      }
      // Include if: property has multiple different values OR appears only once
      propertyHasMultipleValues.set(
        key,
        values.size > 1 || occurrenceCount === 1,
      )
    }

    // Second pass: build keyframes with incremental changes
    accumulatedTime = 0
    let previousKeyframe: Record<string, unknown> = { ...initialValues }
    for (let i = 0; i < chain.length; i++) {
      const step = chain[i]
      accumulatedTime += step.duration

      const percentage = Math.round((accumulatedTime / totalDuration) * 100)
      const percentageKey = `${percentage}%`

      const changes = allChanges[i]

      // Only include properties that changed from previous keyframe AND have multiple values
      const incrementalChanges: Record<string, unknown> = {}
      for (const [key, value] of Object.entries(changes)) {
        if (
          propertyHasMultipleValues.get(key) &&
          previousKeyframe[key] !== value
        ) {
          incrementalChanges[key] = value
        }
      }

      if (Object.keys(incrementalChanges).length > 0) {
        keyframes[percentageKey] = incrementalChanges
        previousKeyframe = { ...previousKeyframe, ...incrementalChanges }
        hasChanges = true
      }
    }

    // If this child has changes, add animation props
    if (hasChanges && Object.keys(keyframes).length > 1) {
      const firstEasing = firstStep.easing || { type: 'LINEAR' }
      const delay = chain[0].delay

      const props: Record<string, string> = {
        animationName: `keyframes(${JSON.stringify(keyframes)})`,
        animationDuration: `${fmtDuration(totalDuration)}s`,
        animationTimingFunction: getEasingFunction(firstEasing),
        animationFillMode: 'forwards',
      }

      // Only add delay if it's significant (>= 0.01s / 10ms)
      if (delay >= 0.01) {
        props.animationDelay = `${fmtDuration(delay)}s`
      }

      // Add infinite iteration if it's a loop
      if (isLoop) {
        props.animationIterationCount = 'infinite'
      }

      childAnimationsMap.set(childName, props)
    }
  }

  return childAnimationsMap
}

async function generateSingleNodeDifferences(
  fromNode: SceneNode,
  toNode: SceneNode,
): Promise<Record<string, unknown>> {
  const changes: Record<string, unknown> = {}

  // Check position changes
  if ('x' in fromNode && 'x' in toNode && 'y' in fromNode && 'y' in toNode) {
    if (fromNode.x !== toNode.x || fromNode.y !== toNode.y) {
      const deltaX = toNode.x - fromNode.x
      const deltaY = toNode.y - fromNode.y

      changes.transform = `translate(${fmtPct(deltaX)}px, ${fmtPct(deltaY)}px)`
    }
  }

  // Check size changes
  if (
    'width' in fromNode &&
    'width' in toNode &&
    'height' in fromNode &&
    'height' in toNode
  ) {
    if (fromNode.width !== toNode.width) {
      changes.w = `${fmtPct(toNode.width)}px`
    }
    if (fromNode.height !== toNode.height) {
      changes.h = `${fmtPct(toNode.height)}px`
    }
  }

  // Check opacity changes
  if ('opacity' in fromNode && 'opacity' in toNode) {
    if (fromNode.opacity !== toNode.opacity) {
      changes.opacity = fmtPct(toNode.opacity)
    }
  }

  // Check background color changes
  if ('fills' in fromNode && 'fills' in toNode) {
    const fromFills = fromNode.fills
    const toFills = toNode.fills

    if (
      Array.isArray(fromFills) &&
      fromFills.length > 0 &&
      Array.isArray(toFills) &&
      toFills.length > 0
    ) {
      const fromFill = fromFills[0]
      const toFill = toFills[0]

      if (
        fromFill.type === 'SOLID' &&
        toFill.type === 'SOLID' &&
        !isSameColor(fromFill.color, toFill.color)
      ) {
        changes.bg = rgbToString(toFill.color, toFill.opacity)
      }
    }
  }

  // Check rotation changes
  if ('rotation' in fromNode && 'rotation' in toNode) {
    if (fromNode.rotation !== toNode.rotation) {
      const existingTransform = (changes.transform as string) || ''
      changes.transform = existingTransform
        ? `${existingTransform} rotate(${fmtPct(toNode.rotation)}deg)`
        : `rotate(${fmtPct(toNode.rotation)}deg)`
    }
  }

  return changes
}

function getEasingFunction(easing?: { type: string }): string {
  if (!easing) return 'linear'

  switch (easing.type) {
    case 'EASE_IN':
      return 'ease-in'
    case 'EASE_OUT':
      return 'ease-out'
    case 'EASE_IN_AND_OUT':
      return 'ease-in-out'
    default:
      return 'linear'
  }
}

function isSameColor(color1: RGB, color2: RGB): boolean {
  return (
    Math.abs(color1.r - color2.r) < 0.01 &&
    Math.abs(color1.g - color2.g) < 0.01 &&
    Math.abs(color1.b - color2.b) < 0.01
  )
}

function rgbToString(color: RGB, opacity?: number): string {
  const r = Math.round(color.r * 255)
  const g = Math.round(color.g * 255)
  const b = Math.round(color.b * 255)

  if (opacity !== undefined && opacity < 1) {
    return `rgba(${r}, ${g}, ${b}, ${opacity})`
  }

  return `rgb(${r}, ${g}, ${b})`
}
