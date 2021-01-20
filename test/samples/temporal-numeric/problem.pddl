(define (problem problem1) (:domain domain1)

(:objects 
    o1 - t1
)

(:init
    (= (f o1)  0)
)

(:goal (and
    (p o1)
))
    
; Twice f for o1 [unit]
(:metric minimize (* (f o1) 2))

; Second alternative metric [unit]
(:metric minimize (* (f o1) (f o1)))

)
