(define (problem problem1) (:domain domain1)

(:objects 
    O1 - t1
)

(:init
    (= (f O1)  0)
)

(:goal (and
    (p O1)
))
    
; Twice f for O1 [unit]
(:metric minimize (* (f O1) 2))

; Second alternative metric [unit]
(:metric minimize (* (f O1) (f O1)))

)
