; Test domain

(define (domain domain1)

(:requirements :strips  :fluents :durative-actions :typing)

(:types 
    t1
)

(:predicates 
    (p ?t - t1)
    (q ?t - t1)
)

(:functions
    (f ?t - t1); description ... [unit1]
)

(:durative-action action1
    :parameters (?t - t1)
    :duration (= ?duration 10)
    :condition (and )
    :effect (and 
        (at start (q ?t))
        (at start (assign (f ?t) 10))
 
        
        (at end (p ?t))
        (at end (assign (f ?t) 30))

        (increase (f ?t) (* #t 1.0))
    )
)
)